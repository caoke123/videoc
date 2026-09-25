# DFCine MCP playbook

## Inspect

1. `dfcine_get_canvas_info`
2. `dfcine_list_nodes`
3. `dfcine_get_selected_node`
4. `dfcine_get_node_agent_guide`
5. `dfcine_get_node_inputs`
6. `dfcine_get_node_media_paths`
7. `dfcine_get_node_params`

## Build

- Create local assets with `dfcine_create_upload_node_from_file`.
- Create workflow nodes with `dfcine_create_node` or `dfcine_create_connected_node` when permitted.
- Connect nodes with `dfcine_connect_nodes`.
- Arrange nodes with `dfcine_update_node_positions`.
- Group by stage and save proven groups as presets.

Always preview supported mutations with `dryRun: true`.

## Prompt and run

1. Write the prompt with `dfcine_write_node_prompt(dryRun=true)`.
2. Write allowed params with `dfcine_write_node_params(dryRun=true)`.
3. Show the planned workflow, cost-sensitive parameters, and references to the user.
4. After confirmation, commit writes and call `dfcine_run_node`.
5. Wait with `dfcine_wait_for_run`; record outputs immediately.

## Current preferred workflow roles

- H3 multi-reference cloud: image/video/audio references and native synchronized audio.
- Codex Image Gen with GPT Image 2: the only approved image-generation path for product compositing. Generate and inspect the image through Codex's built-in Image Gen, then upload the approved result into the relevant DFCine upload node. DFCine should not run an internal image-generation workflow for this task.
- Qwen multi-image edit: local product/character/scene composition benchmark.
- Krea2 Turbo/HQ, Klein, ZImage: local T2I speed/quality benchmark.
- Bernini/Scail: reference video editing, role replacement, or motion transfer when required.
- Vox: optional post voice design or authorized voice cloning.

## Product composite prompt rules

### Execution boundary

All image generation and DFCine orchestration are separate stages. This applies to text-to-image, storyboard frames, scene images, character images, product images, installed-state composites, and any other raster image asset:

1. Codex calls the built-in Image Gen with the official GPT Image 2 model.
2. Codex inspects the generated bitmap and keeps the result outside `assets/approved/` until human approval.
3. Codex uploads the generated result to the corresponding DFCine upload node with `dfcine_create_upload_node_from_file` or `dfcine_attach_upload_node_asset`.
4. DFCine handles canvas connections, video workflows, previews, runs, and result tracking.

Do not use DFCine image-generation workflows for any image asset. Do not switch the DFCine image node to `apimart.gpt-image2-official`, Qwen, Klein, Krea, ZImage, or image stitching to generate images. DFCine image nodes are for receiving, previewing, routing, or downstream workflow use after Codex has generated the image.

For a seatbelt shoulder-pad composite, use exactly two DFCine input images:

1. Image 1 is the product identity reference. Preserve its real product geometry, fabric, seams, thickness, colors, attached decoration, and proportions.
2. Image 2 is the target scene. Preserve the person, identity, pose, vehicle interior, seatbelt route, camera perspective, framing, and lighting.

If the user provides a correct-wearing reference photo, use it only to extract installation geometry and relative scale. Do not copy its person, clothing, toy, or product identity unless explicitly requested.

The prompt must require:

- The product is already installed at the start of the image; never show installation or adjustment.
- The pad follows the seatbelt's long axis and wraps only the shoulder-to-upper-chest section.
- The seatbelt remains continuous and visible above and below the pad.
- The pad is approximately 3–4 seatbelt-webbing widths long. Its projected width is nominally 1.42 times the local belt width measured at the product depth, acceptable 1.35–1.50 and rejected above 1.55.
- The pad is flat, aligned, physically contacting the belt and clothing, with plausible occlusion, contact shadows, scale, perspective, and color temperature.
- The product does not become a wide shawl, cross the chest, float, look like a sticker, twist the belt, or cover the buckle, latch, retractor outlet, guide, or anchor.
- Treat the pad and attached Shuiba Tutu plush as one rigid product assembly. Preserve their normalized size and anchor position from the product reference; apply the same perspective transform to both.
- Across multiple shots, compare plush width and height relative to pad width and height, and reject any variant where the plush changes size independently.
- No added text, logo, price, watermark, safety claim, duplicate product, or duplicate person.

Recommended DFCine image parameters are `size: 9:16`, `resolution: 2k`, `quality: high`, and `n: 1` unless the user requests otherwise. Run a dry prompt and parameter validation before execution, then require human review before promotion to approved assets.
