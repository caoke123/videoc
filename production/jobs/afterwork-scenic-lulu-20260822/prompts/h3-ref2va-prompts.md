# MiniMax H3 Ref2VA 分镜提示词

生成方式：每个镜头单独运行 `h3.ref.cloud`。以下 `<Picture N>` 是本地编译标签；正式写入 DFCine 前，必须读取节点实际 `inputLabel` 并按真实标签替换，不得自行假设编号。

统一约束：9:16；写实年轻车主生活方式广告；水豚噜噜从首帧开始已正确安装；安全带连续、平整、不扭转；黑色套体、玩偶与配件保持一个刚性完整SKU；套体宽度保持为相邻安全带的1.35–1.50倍；不生成安装、调整、触碰、拉扯、安全功效、价格、字幕、Logo或水印。旁白、字幕和CTA全部后期添加。

## S01｜产品Hook｜3秒

### Reference manifest

- `<Picture 1>`：`assets/approved/S01-product-hook-v3.png`，镜头首帧与构图锚点。
- `<Picture 2>`：`assets/source/product-front-white.png`，完整SKU身份真值，不作为屏幕尺寸参考。

```text
subject_definitions:
<Subject 1> is the young East Asian woman defined by <Picture 1>, with long dark-brown softly wavy hair, a pearl hair clip, natural peach makeup, a delicate necklace, and a cream-white knit cardigan.
<Subject 2> is the complete white capybara Lulu seat-belt decoration defined by <Picture 1> and <Picture 2>: one rigid assembly consisting of the long narrow black pad, white fluffy hat, brown ears, red cherry and stem, white round glasses, yellow face, orange muzzle, cream outfit, both arms and feet, and two brown hanging cords with white pom-poms.
<Subject 3> is the clean dark interior of a Chinese left-hand-drive sedan in <Picture 1>, with the driver-side B-pillar and side window opening onto a green suburban road in warm late-afternoon light.
<Picture 1> is the exact first frame and composition anchor for [Shot 1], defining the approved heroine, the driver's anatomical left shoulder, the installed product position, the narrow pad-to-belt scale, the camera viewpoint, and the vehicle interior.

summary:
[keyframe completion + reference generation] The target is a three-second vertical product-hook clip that begins exactly from <Picture 1>. <Subject 2> remains correctly installed on <Subject 1>'s left shoulder-to-upper-chest belt segment while <Subject 3>'s roadside background moves naturally. The product identity from <Picture 2> is preserved without enlarging or redesigning it.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - her facial features, hair, pearl clip, necklace, cream-white cardigan, posture, and visible left shoulder remain unchanged.
<Subject 2> (appears in [Shot 1]): fully_preserved - every SKU component, its rigid geometry, installed height, contact shadow, and narrow pad-to-belt ratio remain unchanged.
<Subject 3> (appears in [Shot 1]): fully_preserved - the dark cabin, B-pillar, side window, warm sunlight, and green suburban road remain consistent.
<Picture 1> ([Shot 1] first frame): fully_preserved - it is used as the literal opening frame and spatial anchor.

detailed_description:
The target uses photorealistic commercial lifestyle photography in a strict 9:16 vertical frame, with warm late-afternoon sunlight and restrained natural contrast.
[Shot 1] The clip begins exactly from <Picture 1>. A tight front-passenger-side view frames the lower half of <Subject 1>'s face, her long dark-brown hair, pearl hair clip, cream-white knit cardigan, and anatomical left shoulder. <Subject 2> is already correctly installed high on the shoulder-to-upper-chest segment. The black pad remains long and narrow, with its projected width fixed at approximately 1.42 times the adjacent vehicle-belt width and never exceeding 1.50 times. One continuous flat black belt enters the exact top center of the pad and exits the exact bottom center along the same projected centerline. The complete plush assembly remains rigidly attached; the white hat, brown ears, red cherry, white glasses, yellow-and-orange face, cream outfit, limbs, cords, and pom-poms do not change shape, color, count, or position. <Subject 1> performs only subtle natural breathing and one soft blink; her head, shoulder, clothing, hair layering, necklace, and product remain stable. The roadside trees outside <Subject 3>'s side window drift horizontally with gentle, physically plausible motion blur, establishing that the car is moving without requiring any new body action. The camera performs one very slow, smooth three-percent push toward <Subject 2>, keeping the product sharp while preserving the approved crop and avoiding macro distortion. Warm sunlight shifts softly across the knit texture and plush fibers without changing the product geometry. No hand enters the frame. No installation, adjustment, pulling, independent swinging, floating, duplication, belt distortion, generated text, logo, price, claim, or watermark appears. The shot ends with <Subject 2> centered and stable, leaving clean lower-frame space for the post-production subtitle “我的车里，必须有点可爱的。”

overall_soundscape:
Low, steady road noise, a soft cabin ventilation hum, and faint tire movement continue naturally for the full three seconds; no dialogue is generated because the Chinese hook will be added as post-production voice-over.

non_diegetic_music:
N/A. Background music will be added during post-production.
```

## S02｜女主驾驶｜7秒

### Reference manifest

- `<Picture 1>`：`assets/approved/S02-driver-lifestyle-v2.png`，镜头首帧、角色、服饰、车辆空间与安装状态锚点。
- `<Picture 2>`：`assets/source/product-front-white.png`，完整SKU身份真值。

```text
subject_definitions:
<Subject 1> is the approved young East Asian female driver in <Picture 1>, with the same face, long dark-brown wavy hair, pearl hair clip, cream-white knit cardigan, light-blue high-waist jeans, natural makeup, and calm attentive expression.
<Subject 2> is the complete white capybara Lulu seat-belt decoration defined by <Picture 1> and <Picture 2>, preserved as one rigid toy-and-black-pad SKU with all facial, costume, limb, cord, pom-pom, and attachment details intact.
<Subject 3> is the Chinese left-hand-drive sedan interior in <Picture 1>, including the vehicle-left driver position, steering wheel and instruments directly ahead, driver-side left door and B-pillar outboard, center console inboard, and fixed right-hip buckle with a red release button.
<Picture 1> is the exact first frame and structural anchor for [Shot 1], defining the approved character, camera origin, left-hand-drive topology, belt routing, product scale, hands, and lighting.

summary:
[keyframe completion + reference generation] The target is a seven-second vertical lifestyle-driving clip beginning exactly from <Picture 1>. <Subject 1> drives calmly through a green suburban road in <Subject 3>, while <Subject 2> stays fixed at the left shoulder-to-upper-chest belt segment with the approved real-world scale and complete SKU identity.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - identity, hairstyle, pearl clip, cream cardigan, blue jeans, posture, attentive gaze, and both-hand driving position remain stable.
<Subject 2> (appears in [Shot 1]): fully_preserved - product geometry, size, shoulder placement, belt alignment, costume, and every attached detail remain unchanged.
<Subject 3> (appears in [Shot 1]): fully_preserved - the left-hand-drive cabin, steering position, outboard B-pillar, inboard center console, fixed buckle, seat geometry, and warm dark-interior look remain intact.
<Picture 1> ([Shot 1] first frame): fully_preserved - it is the literal opening frame and the authority for all vehicle and installation geometry.

detailed_description:
The target uses natural photorealistic commercial footage in a 9:16 vertical frame, with a stable front-passenger-side camera and warm late-afternoon light.
[Shot 1] The clip begins exactly from <Picture 1>. <Subject 1> sits in the vehicle-left driver seat of <Subject 3>, looking forward with a calm, attentive expression. The steering wheel and instrument cluster remain directly in front of her. Her anatomical left side stays outboard toward the driver door and left B-pillar; the center console and the fixed red-button buckle remain inboard at her right hip. Her left hand and right hand maintain natural contact with the steering wheel, making only tiny road-correction movements of a few degrees. She does not look at the camera, speak, gesture, or touch the product. The three-point belt remains one continuous, flat, untwisted system: it begins at the left B-pillar, passes over her anatomical left shoulder, continues through the exact centerline of <Subject 2>, crosses toward the right-hip inboard buckle, and forms a stable lap-belt segment across the pelvis. <Subject 2> remains high on the shoulder-to-upper-chest segment. Its black pad stays long and narrow, approximately 1.42 times the adjacent belt width, and the complete plush-and-pad assembly never bends, slides, rotates, enlarges, detaches, duplicates, or swings independently. Every SKU detail from <Picture 2> remains fixed. <Subject 1>'s long hair moves only minimally with cabin airflow; rear hair stays behind the belt and product while a few genuine foreground strands may softly overlap an edge without hiding the face. Outside the side window, trees and roadside buildings move steadily backward with mild natural motion blur. The camera makes one slow, nearly imperceptible two-percent push inward over seven seconds, preserving the steering wheel, buckle, lap belt, and product within the frame. The clip ends with the same stable driving posture and unchanged product installation, leaving lower-frame room for post subtitles.

overall_soundscape:
Natural low road rumble, soft tire noise, restrained cabin ventilation, and very faint interior material movement remain continuous. No generated dialogue; the Chinese narration will be added in post-production.

non_diegetic_music:
N/A. Music will be added and mixed in post-production.
```

## S03｜湖边落日收尾｜8秒

### Reference manifest

- `<Picture 1>`：`assets/approved/S03-lakeside-close-v3.png`，镜头首帧、停车姿态、产品比例、湖边落日与CTA构图锚点。
- `<Picture 2>`：`assets/source/product-front-white.png`，完整SKU身份真值。

```text
subject_definitions:
<Subject 1> is the same approved young East Asian woman in <Picture 1>, with the same face, long dark-brown wavy hair, pearl hair clip, cream-white knit cardigan, light-blue jeans, natural makeup, and relaxed seated posture with both hands resting in her lap.
<Subject 2> is the complete white capybara Lulu seat-belt decoration defined by <Picture 1> and <Picture 2>, preserved as one rigid black-pad-and-plush SKU with all hat, ear, cherry, glasses, face, costume, limb, cord, pom-pom, and attachment details intact.
<Subject 3> is the parked dark-interior Chinese left-hand-drive sedan and lakeside golden-hour environment in <Picture 1>, with calm water, low distant hills, a roadside fence, and the setting sun visible through the side window.
<Picture 1> is the exact first frame and composition anchor for [Shot 1], defining the parked body posture, product installation, belt route, window view, lighting, and lower-right CTA safe area.

summary:
[keyframe completion + reference generation] The target is an eight-second vertical closing clip beginning exactly from <Picture 1>. <Subject 1> rests quietly in the safely parked car while <Subject 2> remains correctly installed and <Subject 3>'s lake and sunset provide the emotional closing image. The clip ends with stable product geometry and clean space for a post-production CTA.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - her identity, hair, pearl clip, cream cardigan, blue jeans, calm expression, seated posture, and hands-in-lap position remain unchanged.
<Subject 2> (appears in [Shot 1]): fully_preserved - the complete SKU identity, narrow pad scale, shoulder placement, belt alignment, and rigid attachment remain unchanged.
<Subject 3> (appears in [Shot 1]): fully_preserved - the parked dark cabin, side window, lake, low hills, roadside fence, golden sun, and warm color balance remain intact.
<Picture 1> ([Shot 1] first frame): fully_preserved - it serves as the literal opening frame and the endpoint-stability authority.

detailed_description:
The target uses quiet photorealistic lifestyle-ad footage in a strict 9:16 vertical composition, with soft golden-hour light and no generated typography.
[Shot 1] The clip begins exactly from <Picture 1>. The car is fully parked at a safe lakeside pull-off. <Subject 1> remains seated in the vehicle-left driver seat with shoulders relaxed and both hands resting low and still in her lap, clearly away from the steering wheel. She looks quietly toward the view ahead and slightly toward the side window without turning her torso. Her expression stays natural and content; she performs one soft blink and subtle breathing only. <Subject 2> is already correctly installed high on her anatomical left shoulder-to-upper-chest belt segment. The black pad stays long and narrow at approximately 1.42 times the adjacent belt width. A single flat, untwisted belt enters the exact top center of the pad, exits the exact bottom center, and continues toward the fixed inboard right-hip buckle; the lap belt remains stable across the pelvis. The complete plush-and-pad assembly stays rigid, with every detail from <Picture 2> unchanged. It does not slide, rotate, bounce, enlarge, detach, float, or interact with her hands. Her rear hair remains behind the belt and product; only a few real foreground strands may shift by a few millimeters in the warm cabin air. Outside the side window, the calm lake holds a gentle reflection of the setting sun. The water surface shows slow, small ripples, while the distant hills, roadside fence, car interior, and parked body remain stationary. The camera performs one restrained three-percent push toward the balanced triangle formed by <Subject 1>'s face, <Subject 2>, and the sunset. Exposure changes only slightly as the sun lowers; no flare obscures the product. The final two seconds settle into an almost still composition with clean lower-right negative space for the post-production CTA “给车里安排一只噜噜｜点击查看.” No dialogue, lip movement, hand gesture, driving action, installation, text, logo, claim, or watermark is generated.

overall_soundscape:
Quiet parked-cabin room tone, faint lakeside wind outside the closed car, very soft distant birds, and a subtle cooling interior tick are heard. No generated dialogue; the closing Chinese narration will be added in post-production.

non_diegetic_music:
N/A. A light, youthful instrumental bed may be added during post-production.
```
