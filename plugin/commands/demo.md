---

description: Turn a screen recording into a product demo with U-Cut
argument-hint: The recording, and the product's name and colour
---

Make a product demo with the U-Cut tools from: $ARGUMENTS

1. Call `read_recording` on the recording, with the product's name in `hints` so it's heard correctly. If they didn't say which recording, ask.
2. List the moments it found, with what's said in each, and suggest which to skip. Keep it short.
3. Call `make_demo` with the product's name, a colour as a hex code, any logo they gave, and the moments to `skip`.
4. Give them the path to the MP4.
