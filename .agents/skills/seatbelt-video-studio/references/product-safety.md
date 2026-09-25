# Product and installed-state constraints

## Source hierarchy

1. User-approved installed photos and product instructions.
2. Original product photos.
3. User-confirmed written constraints.
4. Conservative inference.

Never infer a missing installation mechanism from category knowledge.

## Wearing-reference protocol

User-provided wearing-reference images are authoritative for the *wearing relationship only*: belt routing, the shoulder-to-upper-chest placement zone, how the belt enters and exits the pad, realistic pad-to-belt scale, subject pose, and plausible occlusion by clothing or hair. They do not establish the target product's toy design, costume, or colorway when those differ from the SKU's approved product image.

Before promoting a generated still or preview frame, record a self-check against both the target SKU images and the relevant wearing reference. Mark it `pass`, `fail`, or `human_review_required`. A hard fail includes any of the following: a belt that ends at the pad or appears pasted over it; a pad not centered on the belt; a floating, detached, duplicated, or penetrated product; product placed below the upper chest or at an implausible angle; impossible hair/clothing/belt order; malformed hands, faces, vehicle controls, or seat geometry; or product identity drift. Do not auto-regenerate a fail; propose a corrected prompt and await human direction.

## Product SKU identity contract

Every toy-and-pad combination is a distinct product SKU. The approved standalone product photo is the complete assembly truth. The black shoulder pad and its attached toy must never be treated as separable creative elements.

For the current Shuiba Tutu SKU:

- physical black pad dimensions: 24 cm long × 6.5 cm wide;
- physical pad aspect ratio: 24 / 6.5 = 3.6923;
- the toy identity, costume, face, glasses, hat, limbs, attachment point, and pose are fixed to the approved product photo;
- the toy-to-pad normalized width, height, center position, overlap, and front/back order are fixed;
- changing the toy while retaining the same black pad creates a new SKU and requires its own approved standalone product image and installed-state reference.

The 24 × 6.5 cm dimensions and 3.6923 aspect ratio define product identity and undeformed shape; they do not directly define pixel size in the frame. On-screen size must be derived from approved installed-state references and local human/belt scale anchors. Perspective may foreshorten the complete assembly, but may not independently distort the toy or pad.

## On-screen relative-scale hierarchy

Use scale anchors in this order:

1. Human-approved installed-state reference with a comparable camera angle.
2. Local vehicle-belt width at the product location.
3. Visible human head width and shoulder width in the same frame.
4. Physical dimensions only as a final plausibility check.

Do not convert 24 cm directly into image pixels. For wide, medium, close, and detail shots, preserve the product's ratios to the nearby person and belt so the whole assembly scales naturally with camera distance.

For projected pad width, use the vehicle belt immediately above or below the product at the same depth. Measure both widths perpendicular to their shared centerline. Target pad width = 1.42 × local belt width; accept 1.35–1.50 × and reject anything above 1.55 ×. Do not compare against a distant belt segment or horizontal image width.

## On-screen contract

Apply `vehicle-spatial-rules.md` before this contract. Product placement is invalid if the underlying driver/passenger seat or three-point-belt routing is spatially wrong, even when the product itself looks plausible.

- Product is already installed at shot start.
- No opening, closing, wrapping, attaching, sliding, repositioning, or removal.
- Person may breathe, look, speak, or make a small non-contact gesture.
- Product follows the belt/body with small plausible motion and never floats independently.
- The vehicle belt passes through the center of the 6.5 cm-wide shoulder pad. The pad wraps around the belt; it is not pasted on top of the belt.
- The complete 24 × 6.5 cm product assembly is placed around the shoulder contact zone and extends along the belt toward the upper chest.
- The product top anchor begins at the shoulder-belt contact zone. The lower end remains in the upper-chest region and does not extend into the abdomen.
- The pad centerline, toy attachment centerline, and vehicle-belt centerline stay aligned after perspective projection.
- Belt remains continuous, flat, untwisted, and without obvious added slack.
- Do not cover or alter buckle, latch, retractor outlet, guide, or anchor.
- Determine hair depth strand by strand from the original scene: rear hair stays behind the belt and product, while only genuinely foreground loose strands may overlap visible product edges.
- Preserve continuous hair paths and translucent strand edges; use restrained compression and contact shadows where hair, belt, pad, plush, clothing, or body touch.
- Never erase or rearrange hair to reveal the SKU, and never place all hair uniformly in front of or behind the product.

## Claims

Use only claims listed in the job's `verified_claims`. Keep unverified safety, crash, injury, certification, and regulatory claims prohibited.
