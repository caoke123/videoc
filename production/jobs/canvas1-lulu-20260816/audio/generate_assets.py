from pathlib import Path

from elevenlabs import ElevenLabs, VoiceSettings


OUT = Path(r"E:\videoC\production\jobs\canvas1-lulu-20260816\audio")
OUT.mkdir(parents=True, exist_ok=True)

voice_text = (
    "每天的路，可能都一样。\n\n"
    "一样的方向，一样的车流，却可以因为一个小小的陪伴，变得不一样。\n\n"
    "水豚噜噜安全带护肩套，把可爱放在每天都能看见的地方。\n\n"
    "陪你出发，也陪你回家。"
)

client = ElevenLabs()

voice_stream = client.text_to_speech.convert(
    voice_id="r6qgCCGI7RWKXCagm158",
    text=voice_text,
    model_id="eleven_v3",
    language_code="zh",
    output_format="mp3_44100_128",
    voice_settings=VoiceSettings(
        stability=0.52,
        similarity_boost=0.78,
        style=0.42,
        speed=0.98,
        use_speaker_boost=True,
    ),
    apply_text_normalization="on",
)

with (OUT / "voiceover_v2_r6qg.mp3").open("wb") as f:
    for chunk in voice_stream:
        f.write(chunk)

music_stream = client.music.compose(
    prompt=(
        "Instrumental background music for a warm everyday car-commute product video. "
        "Gentle acoustic guitar, soft piano, light brushed percussion, subtle airy pads, "
        "bright natural morning feeling, tender and reassuring, simple memorable motif, "
        "steady but unobtrusive, leave clear space for a female Mandarin voiceover. "
        "No vocals, no lyrics, no dramatic drop, no heavy bass, no sound effects."
    ),
    music_length_ms=19000,
    model_id="music_v2",
    output_format="mp3_48000_192",
    force_instrumental=True,
)

with (OUT / "music_bed_v1.mp3").open("wb") as f:
    for chunk in music_stream:
        f.write(chunk)

print(OUT / "voiceover_v2_r6qg.mp3")
print(OUT / "music_bed_v1.mp3")
