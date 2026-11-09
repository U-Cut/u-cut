// Template CSS may only style words. Anything that could fetch from the network, run code, or
// close the <style> tag it sits in is refused, so a shared style can't track or attack anyone who
// previews it. CSS escapes are refused too, since they could spell any of these in disguise.
// This file has no imports, so the licence scan can use the same rule. See docs/decisions/0025.
const unsafe =
  /url\s*\(|src\s*\(|image\s*\(|image-set|cross-fade|element\s*\(|@import|@font-face|expression\s*\(|javascript:|behavior\s*:|-moz-binding|[<\\]/i;

/** Why a template's CSS isn't allowed, or undefined when it's fine. */
export function unsafeCss(css: string): string | undefined {
  const found = unsafe.exec(css);
  return found
    ? `its CSS uses "${found[0].replace(/\s+/g, "")}", which templates can't`
    : undefined;
}
