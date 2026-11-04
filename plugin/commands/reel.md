---

description: Make a reel from photos and clips with U-Cut
argument-hint: A folder of photos or clips, and how it should feel
---

Make a reel with the U-Cut tools from: $ARGUMENTS

1. Call `status`, then `read_media` on the folder or files they named. If they didn't name any, ask where their photos are.
2. Tell them in one or two lines what you found: the scenes, the moments, and anything left out, such as screenshots or near-copies.
3. Choose a vibe (chill, hype, cinematic or nostalgic) and length from what they said, then `plan_reel`. If they want words over it, write a short script and use `write_reel` with those `paths` instead.
4. `render`, and give them the path to the MP4.
