// Shared asset library (production/assets/): SKU originals, approved installed-state images,
// material references. Jobs reference these by "library:<path under production/assets>"
// instead of copying the bytes into every job, so one asset has exactly one identity.

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

export const LIBRARY_PREFIX = 'library:';
const LIBRARY_ROOTS = ['products', 'material-references', 'characters', 'structure-references', 'inbox'];
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const hashCache = new Map();

export const libraryRoot = jobsRoot => join(dirname(jobsRoot), 'assets');

async function walk(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(full));
    else if (IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) found.push(full);
  }
  return found;
}

export async function sha256OfFile(path) {
  const info = await stat(path);
  const key = `${path}:${info.size}:${info.mtimeMs}`;
  if (hashCache.has(key)) return hashCache.get(key);
  const hash = createHash('sha256').update(await readFile(path)).digest('hex');
  hashCache.set(key, hash);
  return hash;
}

// sha256 -> "library:products/<sku>/source/product-front.png"
export async function buildLibraryIndex(jobsRoot) {
  const root = libraryRoot(jobsRoot);
  const index = new Map();
  for (const sub of LIBRARY_ROOTS) {
    for (const file of await walk(join(root, sub))) {
      const hash = await sha256OfFile(file);
      const ref = `${LIBRARY_PREFIX}${relative(root, file).split(sep).join('/')}`;
      if (!index.has(hash)) index.set(hash, ref);
    }
  }
  return index;
}

const LIBRARY_CATEGORIES = [
  { id: 'characters', label: '角色定妆照', dir: 'characters' },
  { id: 'products', label: '产品参考图', dir: 'products' },
  { id: 'material-references', label: '材料参考图', dir: 'material-references' },
  { id: 'structure-references', label: '结构参考图', dir: 'structure-references' },
  { id: 'inbox', label: '未整理', dir: 'inbox' },
];
export const LIBRARY_CATEGORY_IDS = LIBRARY_CATEGORIES.map(category => category.id);

export function isImageFile(path) {
  return IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
}

// "seatbelt-shoulder-pad/pink-lulu-v1" -> ["seatbelt-shoulder-pad", "pink-lulu-v1"] (up to 2 levels:
// product category, then SKU/material/structure name), sanitizing each segment separately.
export function sanitizeGroupSegments(group) {
  return String(group || '')
    .split('/')
    .map(segment => segment.trim().replace(/[\\/]+/g, '-').slice(0, 60))
    .filter(Boolean)
    .slice(0, 2);
}

// Read-only listing for the "素材库" browser page: groups every image under production/assets/ by category.
export async function listLibraryAssets(jobsRoot) {
  const root = libraryRoot(jobsRoot);
  const categories = [];
  for (const category of LIBRARY_CATEGORIES) {
    const files = await walk(join(root, category.dir));
    const items = await Promise.all(files.map(async file => {
      const relPath = relative(root, file).split(sep).join('/');
      const info = await stat(file);
      const segments = relPath.split('/');
      return {
        ref: `${LIBRARY_PREFIX}${relPath}`,
        path: relPath,
        name: segments[segments.length - 1],
        group: segments.slice(1, -1).join('/') || null,
        bytes: info.size,
        updated_at: info.mtime.toISOString(),
      };
    }));
    items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    categories.push({ id: category.id, label: category.label, items });
  }
  return categories;
}

// Entities: a registration file next to the images groups them into one product / character / scene /
// material. "sku.json" (or "character.json", "scene.json", "material.json") claims its whole folder;
// "<id>.<type>.json" claims only the files it lists, so several entities can share one folder.
const ENTITY_SIDECAR = /^(?:(.+)\.)?(sku|character|scene|material)\.json$/;

async function findSidecars(root) {
  const found = [];
  const visit = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (ENTITY_SIDECAR.test(entry.name)) found.push(full);
    }
  };
  for (const sub of LIBRARY_ROOTS) await visit(join(root, sub));
  return found.sort();
}

export async function listLibraryEntities(jobsRoot) {
  const root = resolve(libraryRoot(jobsRoot));
  const images = new Map();
  for (const sub of LIBRARY_ROOTS) {
    for (const file of await walk(join(root, sub))) {
      const info = await stat(file);
      const path = relative(root, file).split(sep).join('/');
      images.set(file, { ref: `${LIBRARY_PREFIX}${path}`, path, name: basename(file), bytes: info.size, updated_at: info.mtime.toISOString() });
    }
  }
  const problems = [];
  const drafts = [];
  const claimed = new Set();
  for (const sidecarPath of await findSidecars(root)) {
    const match = ENTITY_SIDECAR.exec(basename(sidecarPath));
    const type = match[2];
    const scoped = Boolean(match[1]);
    let data;
    try { data = JSON.parse(await readFile(sidecarPath, 'utf8')); } catch (error) { problems.push(`${relative(root, sidecarPath)}：${error.message}`); continue; }
    const dir = dirname(sidecarPath);
    const warnings = [];
    const claims = [];
    const claim = (rel, role, kind = 'other') => {
      const abs = resolve(dir, String(rel));
      if (!abs.startsWith(root + sep) || !images.has(abs)) { warnings.push(`图片缺失：${rel}`); return; }
      claimed.add(abs);
      claims.push({ abs, role, kind });
    };
    if (type === 'sku') {
      const assets = data.assets || {};
      if (assets.identity_source) claim(assets.identity_source, '商品原图（身份真值）', 'identity');
      if (assets.installed_reference) claim(assets.installed_reference, '佩戴参考（已批准）', 'installed');
      for (const extra of assets.extra_references || []) claim(extra.path, extra.role || '其他参考', extra.seat ? `installed-${extra.seat}` : 'other');
    } else {
      (data.images || []).forEach((image, index) => claim(image.path, image.role || '其他', index === 0 ? 'identity' : 'other'));
    }
    drafts.push({ type, scoped, dir, data, claims, warnings, sidecarPath });
  }
  const entities = [];
  const ids = new Set();
  for (const draft of drafts) {
    const { type, scoped, dir, data, claims, warnings } = draft;
    if (!scoped) {
      for (const [abs] of images) {
        if (abs.startsWith(dir + sep) && !claimed.has(abs)) { claimed.add(abs); claims.push({ abs, role: '其他', kind: 'other' }); }
      }
    }
    const id = String(type === 'sku' ? data.sku_id : data.id || basename(dir));
    if (ids.has(id)) { problems.push(`重复的实体 id：${id}`); continue; }
    ids.add(id);
    const { schema_version, assets, images: _images, aliases, name, status, id: _id, sku_id, category_id, category, ...meta } = data;
    if (type === 'sku' && data.plush_geometry == null) warnings.push('玩偶几何未测量');
    if (type === 'sku' && !assets?.installed_reference) warnings.push('没有已批准的佩戴参考图');
    const entityImages = claims.map(({ abs, role, kind }) => ({ ...images.get(abs), role, kind }));
    entities.push({
      id, type, name: name || id, aliases: aliases || [], status: status || 'approved',
      sidecar: relative(root, draft.sidecarPath).split(sep).join('/'),
      category: (type === 'sku' ? category_id : category) || null,
      folder: relative(root, dir).split(sep).join('/'),
      cover: entityImages[0]?.ref || null, images: entityImages,
      related: type === 'sku' && assets?.material_reference ? [assets.material_reference] : [],
      meta, warnings,
    });
  }
  const unassigned = [...images].filter(([abs]) => !claimed.has(abs)).map(([, item]) => item).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return { entities, unassigned, problems };
}

// Reference roles are never sent to the video model, so a wearing photo that shows another person must
// be introduced in the prompt itself. Fill {ref} with the image's position in the shot's reference list.
const INSTALLED_PROMPT_NOTE = "Reference image {ref} is a photo of a DIFFERENT woman wearing the product; use it ONLY for how the seatbelt passes through the center of the pad and for the pad's position and proportion on the shoulder. Do NOT take from it her face, hair or hairstyle, skin, body, pose, clothing or the car interior; none of these may appear in the video. The only person in the video is the woman from the identity reference.";
const PLACEMENT_ZONES = { shoulder_to_upper_chest: '肩部至上胸，下缘不伸至腹部' };
const joinParts = list => list.map(item => String(item).replaceAll('_', ' ')).join('、');

function plushText(plush) {
  const size = plush.plush_width_cm && plush.plush_height_cm ? `玩偶实物约${plush.plush_width_cm}×${plush.plush_height_cm}cm（宽×高），` : '';
  const center = plush.plush_center_y_from_pad_top != null ? `，中心距垫顶约${plush.plush_center_y_from_pad_top}` : '';
  const tolerance = plush.tolerance_percent != null ? `（容差${plush.tolerance_percent}%）` : '';
  return `${size}宽约为垫宽的${plush.plush_width_to_pad_width}倍，高约为垫长的${plush.plush_height_to_pad_length}${center}${tolerance}。`;
}

function buildLock(entity, use) {
  const { type, name, meta } = entity;
  if (type === 'sku') {
    const parts = Array.isArray(meta.identity_locked_parts) ? `锁定部件：${joinParts(meta.identity_locked_parts)}。` : '';
    const head = `商品锁（${name}）：玩偶与黑色护肩套是完整预装的一件刚性商品，外观、配饰与轮廓以商品原图为准，不拆分、独立缩放、折叠、扭曲或移位。${parts}`;
    if (use !== 'installed') return `${head}该镜头商品未安装在安全带上，不套用带宽比例和肩胸位置。`;
    const belt = meta.installed_reference_scale?.pad_width_to_local_vehicle_belt_width;
    const zone = meta.installation?.placement_zone;
    const plush = meta.plush_geometry;
    return [
      head,
      entity.images.some(image => image.kind === 'installed') ? '佩戴关系以已批准佩戴参考为准：' : '佩戴关系按同尺寸黑垫的登记比例（本款尚无已批准佩戴参考）：',
      belt ? `护肩套宽度约为同景深局部安全带宽度的${belt.nominal}倍（合格${belt.min}–${belt.max}，超过${belt.hard_reject_above}淘汰）；` : '',
      meta.installation?.vehicle_belt_passes_inside_pad ? '安全带从垫顶中心进入、底部中心穿出，中心线对齐，连续平整不扭曲；' : '',
      zone ? `位置在${PLACEMENT_ZONES[zone] || String(zone).replaceAll('_', ' ')}。` : '',
      plush ? plushText(plush) : '',
    ].join('');
  }
  if (type === 'character') return `人物锁（${name}）：只继承脸型、五官、肤色、年龄感、发型发色、身高体型与当前造型；不继承参考图自身的背景、房间、姿势、构图、画角和原始光线；转头、遮挡、说话和快速运动时保持同一张脸。`;
  if (type === 'scene') return `场景锁（${name}）：座椅、中控、氛围灯等整体布局和材质与参考图一致；画面左右与机位以参考图为准，不镜像。${meta.notes ? String(meta.notes) : ''}`;
  return `材质锁（${name}）：${meta.notes ? String(meta.notes) : '以参考图为准。'}`;
}

// Everything an Agent needs to use one library entity in a prompt: which images to attach (in
// shot-plan "references" form, with roles), every image the entity has, and a lock paragraph
// generated from the registered values. use: "installed" (shown worn on a belt) or "standalone".
export async function resolveLibraryEntity(jobsRoot, query, use = 'installed', seat = 'driver') {
  const wanted = String(query || '').trim().toLowerCase();
  if (!wanted) throw new Error('缺少查询词 q');
  const { entities } = await listLibraryEntities(jobsRoot);
  const names = entity => [entity.id, entity.name, ...entity.aliases].map(text => text.toLowerCase());
  let found = entities.filter(entity => names(entity).includes(wanted));
  if (!found.length) found = entities.filter(entity => names(entity).some(text => text.includes(wanted)));
  if (!found.length) return { status: 404, body: { error: `素材库里没有匹配“${query}”的实体` } };
  if (found.length > 1) return { status: 200, body: { ambiguous: true, candidates: found.map(({ id, name, type, aliases }) => ({ id, name, type, aliases })) } };
  const entity = found[0];
  const mode = use === 'standalone' ? 'standalone' : 'installed';
  const byKind = kind => entity.images.find(image => image.kind === kind);
  const references = [];
  const warnings = [...entity.warnings];
  const add = (image, role, extra = {}) => image && references.push({ path: image.ref, role, ...extra });
  if (entity.type === 'sku') {
    add(byKind('identity'), `${entity.name} SKU 完整身份真值`);
    const seatRef = seat === 'passenger' ? byKind('installed-passenger') : null;
    if (mode === 'installed' && seat === 'passenger' && !seatRef) warnings.push('没有登记副驾驶位佩戴参考，已退回主驾佩戴参考；副驾肩带方向与主驾镜像，需在提示词里单独写明');
    if (mode === 'installed') add(seatRef || byKind('installed'), `${entity.name} ${seatRef ? '副驾驶位' : ''}安装关系参考：只取护肩套与安全带的位置、比例、穿入穿出关系，不取图中人物身份`, { prompt_note: INSTALLED_PROMPT_NOTE });
    for (const ref of mode === 'installed' ? entity.related : []) {
      const owner = entities.find(other => other.images.some(image => image.ref === ref));
      if (owner) references.push({ path: ref, role: `${owner.name}：材质真值` });
    }
  } else {
    const roles = { character: `${entity.name}：身份与造型主参考，不继承其背景、姿势与构图`, scene: `${entity.name}：场景与空间连续性参考`, material: `${entity.name}：材质真值` };
    add(entity.images[0], roles[entity.type]);
  }
  if (entity.status === 'pending') warnings.push('该实体待确认，尚不是已批准资产');
  return {
    status: 200,
    body: {
      entity: { id: entity.id, type: entity.type, name: entity.name, aliases: entity.aliases, status: entity.status, category: entity.category },
      use: mode,
      references,
      images: entity.images.map(({ ref, role, kind }) => ({ path: ref, role, kind })),
      lock: buildLock(entity, mode),
      warnings,
    },
  };
}

// Registering an image that sits in the "未整理" inbox (or anywhere unclaimed): the file moves into
// the entity's folder and the entity's registration file is updated, so it survives restarts and is
// what resolveLibraryEntity / the 素材库 page read. Writes to one registration file are serialized.
const sidecarLocks = new Map();
function withSidecarLock(key, action) {
  const next = (sidecarLocks.get(key) || Promise.resolve()).catch(() => {}).then(action);
  sidecarLocks.set(key, next);
  void next.finally(() => { if (sidecarLocks.get(key) === next) sidecarLocks.delete(key); }).catch(() => {});
  return next;
}

async function writeJsonAtomic(path, data) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`);
  await rename(temporary, path);
}

const slugify = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const CREATABLE = {
  character: { dir: 'characters', file: 'character.json', role: '身份主图' },
  scene: { dir: 'structure-references', file: 'scene.json', role: '场景参考' },
  material: { dir: 'material-references', file: 'material.json', role: '材质真值' },
};
const toPosix = path => path.split(sep).join('/');

export async function registerLibraryImage(jobsRoot, { path, entityId, role = 'other', label, create }) {
  const root = resolve(libraryRoot(jobsRoot));
  const relPath = String(path || '').replaceAll('\\', '/');
  const source = resolve(root, relPath);
  if (!relPath || relPath.split('/').includes('..') || !source.startsWith(root + sep) || !isImageFile(source)) throw new Error('图片路径无效');
  const listing = await listLibraryEntities(jobsRoot);
  if (!listing.unassigned.some(item => item.path === toPosix(relative(root, source)))) throw new Error('这张图不在“未整理”里，可能已经登记过');
  const hash = (await sha256OfFile(source)).slice(0, 8);
  const ext = extname(source).toLowerCase();
  const note = String(label || '').trim().slice(0, 80);
  const result = target => ({ path: toPosix(relative(root, target)), ref: `${LIBRARY_PREFIX}${toPosix(relative(root, target))}` });

  const place = async (dir, fileName) => {
    const target = join(dir, fileName);
    await mkdir(dir, { recursive: true });
    await rename(source, target);
    return target;
  };

  if (create) {
    const spec = CREATABLE[create.type];
    const name = String(create.name || '').trim().slice(0, 60);
    if (!spec) throw new Error('只能新建人物、场景或材质；新产品需要测量尺寸，请让 Agent 登记');
    if (!name) throw new Error('请填写名称');
    const id = `${create.type}-${hash}`;
    const dir = join(root, spec.dir, id);
    if (await stat(dir).then(() => true, () => false)) throw new Error('这张图已经登记成实体了');
    const fileName = `${create.type}-${hash}${ext}`;
    const target = await place(dir, fileName);
    try {
      await writeJsonAtomic(join(dir, spec.file), { schema_version: 1, id, name, status: 'approved', category: null, images: [{ path: fileName, role: note || spec.role }], notes: '' });
    } catch (error) { await rename(target, source); throw error; }
    return { entityId: id, ...result(target) };
  }

  const entity = listing.entities.find(item => item.id === entityId);
  if (!entity) throw new Error('找不到要登记到的实体');
  const sidecarPath = join(root, ...entity.sidecar.split('/'));
  const dir = dirname(sidecarPath);
  return withSidecarLock(sidecarPath, async () => {
    const data = JSON.parse(await readFile(sidecarPath, 'utf8'));
    let target;
    let apply;
    if (entity.type === 'sku') {
      data.assets = data.assets || {};
      const extras = data.assets.extra_references = data.assets.extra_references || [];
      let folder = 'source';
      let base = 'reference';
      if (role === 'identity') {
        if (data.assets.identity_source) throw new Error('该产品已有商品原图，替换请让 Agent 处理');
        base = 'product-front';
        apply = rel => { data.assets.identity_source = rel; };
      } else if (role === 'driver') {
        folder = 'approved';
        base = 'installed-driver';
        apply = rel => { if (data.assets.installed_reference) extras.push({ path: rel, role: note || '主驾佩戴参考（另一张）' }); else data.assets.installed_reference = rel; };
      } else if (role === 'passenger') {
        folder = 'approved';
        base = 'installed-passenger';
        apply = rel => extras.push({ path: rel, role: note || '副驾驶位佩戴参考', seat: 'passenger' });
      } else {
        base = slugify(note) || 'reference';
        apply = rel => extras.push({ path: rel, role: note || '其他参考' });
      }
      target = await place(join(dir, folder), `${base}-${hash}${ext}`);
    } else {
      target = await place(dir, `${slugify(note) || entity.type}-${hash}${ext}`);
      apply = rel => { data.images = data.images || []; data.images.push({ path: rel, role: note || '其他' }); };
    }
    try { apply(toPosix(relative(dir, target))); await writeJsonAtomic(sidecarPath, data); } catch (error) { await rename(target, source); throw error; }
    return { entityId: entity.id, ...result(target) };
  });
}

// Job-independent import for the workbenches (生图/视频工作台, 我的资产): writes straight into
// "<category>/[group/]<name>", same dedup-by-sha256 rule as promoteAssetToLibrary in
// job-actions.mjs, so trying a prompt in the workbench and saving the good result never needs a job.
export async function importLibraryAsset(jobsRoot, { category, group, name, mimeType, bytes }) {
  category = category || 'inbox';
  if (!LIBRARY_CATEGORY_IDS.includes(category)) throw new Error('素材分类无效');
  if (!bytes?.length) throw new Error('不能上传空文件');
  const safeName = basename(String(name || 'asset')).normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 120);
  const ext = extname(safeName).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) throw new Error('只能收录图片素材');
  const actualMime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext];
  if (mimeType && mimeType !== 'application/octet-stream' && String(mimeType).toLowerCase() !== actualMime) throw new Error('文件类型和扩展名不匹配');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const existingRef = (await buildLibraryIndex(jobsRoot)).get(sha256);
  if (existingRef) return { ref: existingRef, path: existingRef.slice(LIBRARY_PREFIX.length), duplicate: true };
  const segments = [category, ...sanitizeGroupSegments(group), safeName || `asset${ext}`];
  const targetRelPath = segments.join('/');
  const target = join(libraryRoot(jobsRoot), ...segments);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  return { ref: `${LIBRARY_PREFIX}${targetRelPath}`, path: targetRelPath, duplicate: false };
}

// "library:..." or "assets/..." -> absolute path (null when the reference is malformed or escapes its root).
export function resolveAssetRef(jobsRoot, jobDir, ref) {
  if (typeof ref !== 'string' || ref.split(/[\\/]/).includes('..')) return null;
  if (ref.startsWith(LIBRARY_PREFIX)) {
    const root = libraryRoot(jobsRoot);
    const target = resolve(root, ref.slice(LIBRARY_PREFIX.length));
    return target.startsWith(root + sep) ? target : null;
  }
  if (ref.startsWith('assets/')) return resolve(jobDir, ref);
  return null;
}
