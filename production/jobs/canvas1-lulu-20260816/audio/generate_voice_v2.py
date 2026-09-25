from pathlib import Path

from elevenlabs import ElevenLabs, VoiceSettings


out = Path(r"E:\videoC\production\jobs\canvas1-lulu-20260816\audio\voiceover_v2_r6qg_fit.mp3")
text = (
    "每天的路，可能都一样。\n\n"
    "一样的方向，一样的车流，却可以因为一个小小的陪伴，变得不一样。\n\n"
    "水豚噜噜安全带护肩套，把可爱放在每天都能看见的地方。\n\n"
    "陪你出发，也陪你回家。"
)

client = ElevenLabs()
audio = client.text_to_speech.convert(
    voice_id="r6qgCCGI7RWKXCagm158",
    text=text,
    model_id="eleven_v3",
    language_code="zh",
    output_format="mp3_44100_128",
    voice_settings=VoiceSettings(
        stability=0.52,
        similarity_boost=0.78,
        style=0.42,
        speed=1.13,
        use_speaker_boost=True,
    ),
    apply_text_normalization="on",
)

with out.open("wb") as f:
    for chunk in audio:
        f.write(chunk)

print(out)
