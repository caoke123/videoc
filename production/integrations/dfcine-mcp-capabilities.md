# DFCine MCP capability map

Last checked: 2026-09-25. The DFCine MCP endpoint authenticated successfully; `tools/list` returned 40 tools. Canvas-level calls currently return `DFCine canvas did not respond to the control request`. `dfcine_get_comfyui_status` reports `isConfigured: false`, `isReachable: false`, `kind: unconfigured`, port 8188.

The local ComfyUI status only describes DFCine's configured local ComfyUI process. It does not establish whether AutoDL or the DFCine H3 cloud workflow is ready. Before a paid run, inspect the active canvas, available workflow, workflow guide, selected compute runner, and actual node inputs.

## Tool inventory

| Stage | MCP tools | Use in this project |
| --- | --- | --- |
| Connection and compute status | `dfcine_get_canvas_info`, `dfcine_get_comfyui_status`, `dfcine_start_comfyui`, `dfcine_stop_comfyui`, `dfcine_free_comfyui_memory` | Check canvas and the local ComfyUI lifecycle. Do not infer AutoDL state from local ComfyUI status. Starting or stopping compute is a state-changing action; do it only when requested and after checking which runner the selected workflow uses. |
| Canvas and selection inspection | `dfcine_list_nodes`, `dfcine_get_selected_node`, `dfcine_get_selected_nodes`, `dfcine_list_groups`, `dfcine_get_group` | Read the active graph and resolve human-visible node names to UUIDs before any node operation. |
| Workflow discovery and instructions | `dfcine_list_workflows`, `dfcine_get_workflow_agent_guide`, `dfcine_get_node_agent_guide` | Find the video workflow (expected candidate: `h3.ref.cloud`), then read its actual guide before creating a node or composing input references. Workflow IDs, labels, and supported parameters must be discovered live. |
| Assets and node construction | `dfcine_create_upload_node_from_file`, `dfcine_attach_upload_node_asset`, `dfcine_create_node`, `dfcine_create_connected_node`, `dfcine_connect_nodes`, `dfcine_switch_node_workflow` | Upload approved local references, add workflow nodes, and connect them using exact ports returned by DFCine. Preview supported mutations with `dryRun: true`. |
| Prompt, parameters, and node inspection | `dfcine_get_node_params`, `dfcine_get_node_inputs`, `dfcine_get_node_media_paths`, `dfcine_write_node_prompt`, `dfcine_write_node_params`, `dfcine_write_text_node_content` | Inspect exact reference labels and current values; validate prompt/parameter writes with `dryRun: true`; keep claims, CTA, and subtitles as post overlays. |
| Graph organization | `dfcine_rename_node`, `dfcine_update_node_positions`, `dfcine_create_group`, `dfcine_update_group`, `dfcine_duplicate_group`, `dfcine_delete_group`, `dfcine_delete_group_and_nodes`, `dfcine_delete_nodes` | Name and arrange nodes, optionally group a proven production path. Use dry-run for supported mutations. Deleting groups with nodes or deleting nodes removes graph content and connected edges. |
| Reusable presets | `dfcine_list_preset_groups`, `dfcine_save_group_as_preset`, `dfcine_create_group_from_preset` | List existing presets; save a template only after a real job succeeds, then reuse it with new job assets. |
| Run and retrieve | `dfcine_run_node`, `dfcine_get_run_status`, `dfcine_wait_for_run`, `dfcine_get_node_result` | Submit a confirmed run, retain its `runId`, wait/poll that exact run, and capture output paths and status into the job log. A wait timeout does not cancel generation. |

## Recommended job sequence

1. **Local preparation:** create a categorized job; verify SKU and claims; write script, shot contracts, exact dialogue, overlays, and image references. Generate stills with Codex Image Gen. Keep new stills in `assets/generated/` until self-check and human approval.
2. **DFCine preflight:** call canvas info, list nodes, list video workflows, and read the chosen workflow guide. Confirm the compute runner and cost-sensitive settings. If the canvas bridge is unavailable, stop before graph mutations.
3. **Build one shot at a time:** create upload nodes for the approved standalone SKU and approved installed-state frame; add the chosen H3 Ref2VA workflow; inspect its actual input labels and allowed parameters; connect references by their returned labels; preview prompt and parameter writes with `dryRun: true`.
4. **Paid generation gate:** show the shot, references, dialogue, runner, parameters, and expected duration/cost basis to the user. Run only after explicit approval and after the user has enabled the selected compute. Use one preview per shot; no automatic retries.
5. **Retrieve and log:** wait on the returned run ID, copy MP4/audio and logs into the job, record workflow ID, node ID, run ID, model/runner, prompt version, times, cost if exposed, result paths, and review status.
6. **Human review and post:** review product geometry, belt continuity, audio, lip sync, and endpoint stability. Assemble accepted clips and add Chinese copy/CTA as post overlays. Run the batch validator before delivery.
7. **Learn before templating:** only after a successful, human-accepted job, save the proven graph group as a DFCine preset.

## Project boundaries

- DFCine is the execution and result-tracking layer; category truth and creative planning remain in `production/` job files and category profiles.
- GPT Image 2 via Codex Image Gen is the approved image-generation path. DFCine image-generation workflows are not used for product composites in this project.
- Seatbelt clips must start with the target SKU already installed. No installing, wrapping, fastening, sliding, repositioning, or safety/comfort claims.
- Never guess workflow IDs, reference labels, or parameter names. Discover each from DFCine at runtime.
- Do not treat a prepared canvas or an uploaded image as approval to run paid compute.
