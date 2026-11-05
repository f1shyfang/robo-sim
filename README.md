# Robot Studio

A bright, interactive Three.js robot-arm demo with Rapier physics. Give the arm a command to pick up the orange block and place it on the teal platform.

## Run

Requires Node.js 22+.

```sh
npm install
npm run dev
```

Open http://localhost:5173. Without a key, the interface clearly labels its local command parser. Try **Place the orange block on the platform**.

## Connect Cerebras

Copy `.env.example` to `.env`, add your `CEREBRAS_API_KEY`, then restart the server. Credentials stay on the Node server. `CEREBRAS_MODEL` is configurable; the default is `qwen-3.8-27b`. The planner returns one validated action: place, stop, or reset. Requests time out after six seconds and failures offer an explicit local retry.

## Check and build

```sh
npm test
npm run build
npm start
```

The production server serves the built app at http://localhost:3001. Browser tests use `npx playwright test` while the dev server is running. The checked-in Playwright configuration uses installed macOS Google Chrome; adapt its executable path for another environment.

## Simulation scope

A fixed 60Hz Rapier world handles the dynamic block, floor, barrier, and platform. A kinematic gripper follows a bounded pick-and-place trajectory with a fixed physics joint during grasp. The orange articulated arm visualizes that trajectory; this is not a torque-controlled robot or a full joint-collision robotics simulator. Success requires the released block to remain inside the target and settle. Rendering and physics continue independently of planner requests.

FPS and command-to-action latency are measured in the browser. Local-mode latency is not Cerebras inference latency. This MVP prioritizes a fast single command loop; it does not implement multi-user or multi-robot infrastructure.

For failure recovery, submit `__test_failure__`. See `server/README.md` for API details.

## Verified in this build

- Eight server tests passed: command validation, single-action schema, HTTP API, mocked Cerebras success/error/timeout, and explicit local mode.
- Three browser tests passed in Chrome: physical grasp/release and settled target success; collision contacts and repeatable reset; mobile layout; stop releasing the joint; inference failure with physics continuing; local fallback; reset cancelling a delayed plan.
- Production build passed. Vite reports a large bundle because Three.js and the Rapier WASM compatibility runtime are included; further loading optimization is deferred.
- Live Cerebras was **not tested** because no API key was present. Provider tests use mocked responses. A configured badge indicates key presence, not a successful provider connection.

## Side-by-side model comparison

Open http://localhost:5173/compare (or use **Compare models** in the studio header). The same command is dispatched to Cerebras and OpenAI together, and each independent physics world starts when its validated plan arrives. Both use the same task instructions, output contract, token cap, and 15-second provider deadline. Robot trajectories are identical; no delay is added to either provider.

Add `OPENAI_API_KEY` to the ignored `.env` file and restart `npm run dev` when ready. `OPENAI_MODEL` defaults to `gpt-4.1` and can be changed. Cerebras uses the existing server-side key. Missing keys show **Not configured**, never synthetic timings or local results posing as model responses. **Preview motion · no AI** runs both robots without provider calls or latency claims.

The comparison reports browser command-to-action latency for a single request pair, including network and validation. It is not a controlled model-speed benchmark. Provider responses were mocked for automated comparison tests; live OpenAI remains unverified until credentials are configured. GPT-4.1 API compatibility: https://developers.openai.com/api/docs/models/gpt-4.1.

Comparison validation: all 12 server tests and all 3 comparison browser tests pass. Browser coverage includes mocked independent provider timing, missing credentials, two-world motion preview, reset cancellation, navigation, and mobile overflow.

## Spawn and stack

Both pages start with a 20-box shipment. Use **+ Add 5 boxes** to increase a smaller shipment up to twenty, or **Load 20 boxes** to restore the full challenge. Run “Stack all blocks on the platform” or use the no-AI stacking preview. Every block remains a dynamic physics body: the arm grasps, lifts, releases, and waits for the growing tower to settle before handling the next block. Reset preserves the selected block count.

The comparison now defaults to **GPT-5.6 Sol · Standard** and **GPT-5.6 Sol · Ultrafast**. Each side has an independent profile selector, including the direct Cerebras and configured OpenAI models. Both Sol modes use the same OpenAI model, prompt, reasoning setting, and token limit, with only `service_tier` changing. Ultrafast is Cerebras-powered through OpenAI, requires OpenAI credentials and account access, and is not enabled by a direct Cerebras key. The UI shows the returned service tier and does not declare a speed winner if requested modes are unverified. See https://openai.com/index/previewing-ultrafast/ and https://developers.openai.com/api/reference/resources/responses/methods/create.

Stacking verification: five blocks on both sides reached a stable released tower, with reset restoring all pickup positions. The Sol profile tests verify identical request parameters except service tier and cover unverified/fallback tiers and access errors. Live Sol/Ultrafast requests still require configured credentials and tier access.

## Bulk stacking challenge

The goal is to place every box in a stable destination: four towers of five for a full 20-box shipment. Partial stacks never complete the task. Both comparison worlds start with identical cargo and report their own stacked/required count. Reset restores the full selected shipment.

Bulk verification uses `tests/bulk.spec.js`: browser scheduling is accelerated and rendering is omitted for that test only; production control logic and the 60Hz physics integrator are unchanged. It verifies the task remains running after five placements, all twenty boxes physically settle across four towers before success, the gripper is released, and reset preserves twenty boxes. Normal browser tests separately verify rendering and controls.

## Towers of Hanoi

Open http://localhost:5173/hanoi. Choose 2–5 disks and move the complete tower from A to C. The local A* planner uses `h = disks not on C` as an admissible lower bound and finds the optimal `2^n - 1` moves. The interface shows the search expansion count, remaining lower bound, move list, and execution progress. Run the whole plan, step through one move, pause/resume motion, or reset safely mid-move. No model call or API key is used for this deterministic scenario.

The robot uses a kinematic end effector; dynamic disks are grasped, released, and allowed to settle through Rapier physics. Peg posts are visual guides, not collision shapes. Puzzle legality is enforced separately by the planner and scene controller. This is an educational planning scenario, not torque-controlled robot dynamics.

Hanoi planner tests verify all sizes 2–5 solve legally in exactly 3, 7, 15, and 31 moves. Browser tests cover single-step execution, pause/resume with physics frozen, reset cancellation, mobile layout, and a five-disk fixed-step execution check with accelerated scheduling and GPU rendering omitted.

## Hanoi: Standard vs Ultrafast

Open http://localhost:5173/hanoi/compare, or select **Compare Standard vs Ultrafast** from the Hanoi page. Both requests use GPT-5.6 Sol with the same puzzle, prompt, reasoning setting, and output cap; only the requested service tier differs. The models must return complete explicit move sequences. The server and browser validate every move and the final goal before execution. Invalid or incomplete solutions are rejected—there is no A* fallback or silent plan repair. Legal nonoptimal plans can execute but are labeled with their extra move count.

The page reports time to a validated plan, moves executed, full solve time, and actual returned service tier. Reset cancels pending requests and in-progress moves on both sides. `/api/hanoi-plan` has a 20-second planning deadline and accepts 2–5 disks. Live Ultrafast execution requires account access; a working OpenAI key alone does not establish tier availability.
