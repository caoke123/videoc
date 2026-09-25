# GPT Image 2 product-composite rule set

Use this rule set as the general image-asset handoff rule whenever Codex Image Gen creates an image that will later be uploaded into DFCine, including text-to-image assets, storyboard frames, scene images, character images, product images, and product composites.

## Generation and upload boundary

Generate every image with Codex's built-in Image Gen using the official GPT Image 2 model. Do not ask DFCine to generate images. After generation, inspect the bitmap, preserve it as a separate derived asset, and upload it to the target DFCine upload node. DFCine is the orchestration and video-generation canvas, not the image-generation renderer.

## Input roles

- **Image 1 — product identity:** the actual shoulder pad product photo. Preserve product geometry, black fabric, seams, thickness, edge shape, attached toy or decoration, and proportions.
- **Image 2 — target scene:** the person and vehicle image. Preserve identity, face, hair, clothing, pose, vehicle interior, seatbelt route, framing, camera perspective, and lighting.
- **Optional approved wearing reference — geometry only:** use only to infer wearing position, relative scale, overlap, and belt relationship. Do not copy its person or product identity.

## Required physical relationship

The product is already installed. The shoulder pad follows the seatbelt's long axis and wraps only the shoulder-to-upper-chest section. The belt enters from the vehicle's upper guide, passes continuously through the pad, and continues toward the lap belt and buckle.

Use the approved reference as the scale guide:

- effective pad length: approximately 3–4 seatbelt-webbing widths;
- expanded pad width: nominally 1.42 local seatbelt-webbing widths, acceptable 1.35–1.50;
- belt visibly continuous above and below the pad;
- pad edges perpendicular to the belt direction;
- pad flat against the belt and clothing with plausible contact shadow and occlusion.

## Product-internal scale lock

The shoulder pad and the attached Shuiba Tutu plush are one rigid product assembly, not two independently editable objects.

- Preserve the plush-to-pad width, height, and placement ratios from Image 1.
- Never resize, redraw, replace, simplify, or independently reposition the plush.
- Keep the plush centered on the pad's long axis at the same relative height as Image 1; its attachment point moves with the pad.
- When the pad is perspectively scaled or foreshortened, transform the pad and plush together with the same scale, rotation, shear, and occlusion.
- The plush must remain attached to the pad surface, with the same front/back order and a shared contact shadow.
- Judge consistency using normalized measurements inside the product bounding box, not absolute pixels in the final scene.

### Current Shuiba Tutu SKU measurements

- black pad physical size: 24 cm × 6.5 cm;
- undeformed pad aspect ratio: 3.6923;
- from the approved front product reference, the plush is visibly wider than the black pad and occupies the upper-middle portion of the pad;
- reference-derived normalized targets: plush maximum width ≈ 1.6 × pad width, plush height ≈ 0.62 × pad length, plush center ≈ 0.42 of the pad length measured from the top;
- allowed generation tolerance for these normalized targets: ±5%; outside this range requires regeneration;
- preserve the complete product silhouette, including ears, hanging cords, feet, glasses, hat, clothing, and exposed black-pad areas above and below the plush.

Physical dimensions are identity checks, not pixel-scale instructions. Never ask the model to make the product appear 24 cm long in isolation. Determine its projected size from the approved installed reference, local belt width, head width, shoulder width, and camera distance.

### Approved installed-reference scale targets

For a medium driver portrait comparable to the approved reference:

- projected black-pad width target ≈ 1.42 × the local vehicle-seatbelt width measured immediately above or below the product at the same projected depth;
- acceptable width range is 1.35–1.50 ×; 1.55 × is a hard rejection limit, not a creative range;
- compare widths perpendicular to the shared belt/pad centerline, never by horizontal image width or against a remote belt segment at another depth;
- projected black-pad length ≈ 1.4–1.7 × visible head width;
- projected black-pad width ≈ 0.4–0.5 × visible head width;
- complete plush width ≈ 0.7–0.85 × visible head width and remains visibly wider than the black pad;
- projected pad length ≈ 0.65–0.85 × visible shoulder width;
- product top anchor at the shoulder-belt contact area; product lower edge stays in the upper-chest region;
- use these ranges as perspective-aware targets, not rigid pixel constants.

For close-ups or wide shots, keep the same local ratios after accounting for depth. Scale the person, belt, pad, and plush coherently with the camera; do not keep the product at a fixed pixel size.

Do not ask the model to recreate the plush from a verbal description. Use the approved SKU image as an identity reference and request placement of the complete assembly as one object.

## Vehicle-belt installation lock

- Treat the vehicle seatbelt as passing inside the black pad along its centerline.
- Use local vehicle-belt width as the primary projected-width anchor: nominal pad-to-belt ratio 1.42, acceptable 1.35–1.50, reject above 1.55.
- The black pad wraps around the belt and must show plausible thickness, edge roll, fabric contact, and a small contact shadow.
- Vehicle belt must be visible entering the top center of the pad and exiting the bottom center.
- Align pad, plush attachment, and belt centerlines in the same projected direction.
- Place the 24 cm pad around the shoulder contact zone, extending toward the upper chest; do not anchor it at the center of the torso.
- Match the approved installed reference's projected size and placement relative to head, shoulders, and belt; physical centimeters are only a plausibility check.
- Preserve continuous belt geometry from upper guide through the product to the buckle.

## Hair and product depth lock

- Resolve depth locally from the target image; never force all hair uniformly in front of or behind the product.
- Hair already trapped between the body and vehicle belt remains behind the belt and pad, with subtle compression at contact.
- Only loose foreground strands whose original paths cross the belt may pass in front of the pad or plush, and only over the physically intersecting area.
- Preserve strand continuity, fine translucent edges, and restrained contact shadows. Never cut, erase, duplicate, reroute, or teleport hair to expose the product.
- The product may hide rear hair; genuine foreground strands may partially hide its edges or plush. Do not move the hairstyle merely to improve SKU visibility.

## Forbidden outcomes

- oversized shawl-like pad covering the torso;
- pad crossing the chest instead of following the belt;
- floating, sticker-like, twisted, or detached product;
- broken, kinked, or implausibly slack seatbelt;
- blocked buckle, latch, retractor outlet, guide, or anchor;
- installation, opening, wrapping, fastening, sliding, repositioning, or removal action;
- invented product geometry, extra products, extra people, text, logo, price, watermark, or safety claim.
- independent scaling or repositioning of the plush relative to the pad;
- plush size changing between otherwise matching camera shots;
- pad aspect ratio outside the perspective-correct projection of 3.6923;
- vehicle belt appearing behind or beside the product instead of passing through the pad;
- any redrawing or identity drift of the approved toy SKU;
- blanket all-in-front or all-behind hair layering, broken strands, or hair unnaturally pasted over the complete product;

## Recommended execution

- Codex built-in Image Gen model: official GPT Image 2.
- After human acceptance, upload the generated image to the corresponding DFCine upload node.
- Parameters: `size: 9:16`, `resolution: 2k`, `quality: high`, `n: 1`.
- Write one explicit multi-image prompt naming Image 1 and Image 2 and assigning their roles.
- Review the result before uploading for product scale, belt continuity, alignment, occlusion, contact shadows, and unchanged person/vehicle scene.
- Compare normalized plush-to-pad ratios and the product's perspective orientation across variants before approval.
- Use DFCine dry run only for upload-node attachment, canvas connections, and other DFCine mutations.
- Do not promote the result to `assets/approved/` until human approval.

## Human-approved brown Shuiba Lulu benchmark

Use `production/assets/products/shuiba-lulu-brown-black-pad-v1/approved/installed-driver-v1.png` as the approved installed-state benchmark for the brown pilot Shuiba Lulu SKU. Its product identity source is `production/assets/products/shuiba-lulu-brown-black-pad-v1/source/product-front.png`.

The accepted result confirms this combination of constraints:

- preserve the woman identity while rebuilding a realistic driver pose and vehicle scene;
- keep the complete brown-pilot plush and black pad as one rigid source-locked assembly;
- keep pad width at nominally 1.42 times the immediately adjacent vehicle-belt width, with the existing 1.35–1.50 acceptance range;
- preserve a continuous, flat three-point belt entering and exiting the pad centerline;
- resolve long-hair overlap locally without clearing hair merely to expose the product;
- retain realistic cabin/window depth, daylight, road context, material contact, and product shadows.
