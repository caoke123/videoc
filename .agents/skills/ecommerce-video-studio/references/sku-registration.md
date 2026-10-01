# SKU registration and use

A registered SKU is a reusable consistency anchor for a product that appears in many jobs. Registration is optional: a one-off or new product leaves `product_sku_id` empty and uses the user's product photo directly as that job's identity truth. Register when a product will recur.

## Where it lives

`production/assets/products/<category>/<folder>/sku.json`, next to the images, with paths relative to that folder. `sku_id` inside the file is authoritative; the folder name is irrelevant, so never rename a folder just to match an id. Resolve a SKU by scanning `sku.json` files by `sku_id` or `aliases` (e.g. 电玩款, 粉裤噜妹). `assets/` and the folder layout come from the library promote flow; only the `sku.json` is hand-written by the Agent.

Fully measured template: `seatbelt-shoulder-pad/shuiba-tutu-black-pad-v1/sku.json`. Fields: identity (`name`, `aliases`, `identity_locked_parts`, `assembly_policy`), `assets` (identity source, installed reference, material reference, extra references with roles), `pad`, `plush_geometry`, `installed_reference_scale`, `installation`, approval (`status`, `approved_on`, `approval_note`).

## Other entity types

The 素材库 page groups images into entities by a registration file next to them. Products use `sku.json`; people use `character.json`, scenes (a vehicle cabin, a composition reference) `scene.json`, materials `material.json`, each with `id`, `name`, `status` (`approved` or `pending`), `category`, `aliases`, `notes` and `images: [{path, role}]`. A folder-level file (`sku.json`, `character.json`, …) claims every image under its folder; a file named `<id>.<type>.json` claims only the images it lists, so several entities can share one folder (see `characters/approved/`). Image paths are relative to the registration file. An image no entity claims shows up under 未整理 on the page (everything saved from the workbench lands there, in `production/assets/inbox/`). The user can register it with the page's 登记到… button, or you can call `POST /api/library/entities/register` with `{path, entityId, role: identity|driver|passenger|other, label}` (attach to an existing entity; for a SKU, `driver` sets the installed reference or adds another one, `passenger` adds a passenger reference with `seat: passenger`) or `{path, create: {type: character|scene|material, name}, label}` (new entity). The file is moved into the entity folder and its registration file updated. A new SKU is never created this way — it needs measured sizes, so you register it by hand per the steps below. Register new people, scenes and materials the same way as a SKU: user confirms, Agent writes the file, never invent facts.

## Registering (Agent does it, user confirms)

1. Get from the user: a complete product photo (identity truth), one installed-state image the user has approved as the lasting baseline, and the name/aliases. A generated installed image is only a candidate until the user says it is approved; never self-approve it.
2. Copy both images into `products/<category>/<folder>/source/product-front.png` and `approved/installed-driver-v1.png` through the promote endpoint (see root `AGENTS.md`), never by writing generation scratch directly into `production/assets/`.
3. Copy the template `sku.json` and fill it. All black pads are the same size, so `pad` and the pad-to-belt ratio (nominal 1.42, range 1.35–1.50, hard reject above 1.55) carry over, but check the approved installed image actually conforms before relying on them. Plush size differs per SKU, so measure `plush_geometry` (plush width/pad width, plush height/pad length, plush center from pad top) from the product photo. If it cannot be measured reliably, set it to `null` and fill `measurement_status`; never invent a number.
4. Show the user the filled values and the two images, and only then set `status: approved` with `approved_on` and the user's own approval wording in `approval_note`.

## Using a library entity in a job (resolve first, do not hand-assemble)

When the user names a product, person, scene or material ("电玩款", "水豚情侣款女主", "奔驰车厢"), ask the local runner for the ready-to-use pack instead of hunting through folders:

`GET http://127.0.0.1:4173/api/library/entities/resolve?q=<id, name or alias>&use=installed|standalone`

- `use=installed` for shots that show the product worn on a belt; `use=standalone` for handheld/desk shots (identity image only, no belt ratios).
- Add `&seat=passenger` for front-passenger shots. A SKU registers a passenger wearing reference as an `extra_references` entry with `"seat": "passenger"`; the pack then uses it instead of the driver reference. If none is registered you get a warning and the driver reference as a fallback, and the prompt must state the mirrored (passenger-side) belt direction itself.
- The response has `references` (already in `shot-plan.json` `references[]` form, `library:` path plus role — paste into the shot), `images` (every image the entity has, with roles, if a shot needs another angle), `lock` (a Chinese product/person/scene/material lock paragraph generated from the registered values — put it in the prompt as is, do not retype the numbers), and `warnings` (unmeasured plush geometry, `待确认` entities, missing files — tell the user, do not paper over them).
- `{"ambiguous": true, "candidates": [...]}` means several entities matched: ask the user which one, never pick. A 404 means nothing matches; ask, or treat the product as unregistered and use the user's photo. If the runner is not running, fall back to reading the `sku.json` / `*.character.json` / `scene.json` / `material.json` files directly.
- **Wearing photos that show a person:** the `role` text is not sent to the video model, only the prompt and the images are. When a `references` entry carries a `prompt_note`, copy it into the shot prompt with `{ref}` replaced by that image's position in the shot's reference list, and also state in the prompt that the identity reference is the only person, name her outfit, and name the cabin reference as the only environment. Never write "use all references faithfully". Tested on 2026-10-01 (帕恰狗 S02 took another woman from the wearing photo): a masked crop and the full photo with this wording both passed review, so do not crop wearing photos; the wording is enough.
- Only the recommended `references` are attached by default; add extra angles from `images` only when the shot needs them. A `pending` entity may be used when the user asks for it, but say it is not an approved asset.

The same rules, by hand:

- Fill `brief.product_sku_id`. For each shot, add `references[]`: `identity_source` as the SKU identity truth; `material_reference` for any shot showing the pad; `installed_reference` only for shots that depict the installed or worn state, with the role "installed relationship only — position, ratio, belt threading; not the person's identity".
- Write the product-lock part of the prompt from `sku.json` values (belt ratio, placement zone, belt passes inside the pad, locked parts, plush geometry if present) instead of typing numbers by hand. If `plush_geometry` is `null`, state no plush ratio.
- Shots that do not show installation (handheld, standalone) take the identity source only; do not apply belt-ratio or placement rules to them.
