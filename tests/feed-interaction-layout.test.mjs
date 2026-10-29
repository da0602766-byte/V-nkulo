import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";

const files = ["app/globals.css", "app/feed-worship.css", "app/community-surfaces.css", "app/components/feed/feed-interactions.css"];
const styles = files.map((path) => postcss.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8")));

// These rules target the actual open reaction picker. Their selectors use only
// tags, classes, attributes and combinators, so their specificity is explicit.
// Evaluate both loading orders to catch the community-surfaces regression.
function declarationsFor(roots, width, target) {
  const result = new Map();
  let order = 0;
  for (const root of roots) root.walkRules((rule) => {
    for (let parent = rule.parent; parent?.type !== "root"; parent = parent.parent) {
      if (parent.type !== "atrule") continue;
      if (parent.name !== "media") return;
      const max = parent.params.match(/max-width:\s*(\d+)px/);
      const min = parent.params.match(/min-width:\s*(\d+)px/);
      if ((max && width > Number(max[1])) || (min && width < Number(min[1])) || (!max && !min)) return;
    }
    for (const selector of rule.selectors) {
      const matches = target === "picker" ? /(?:^|\s|>)\.community-reaction-picker$/.test(selector)
        : /(?:^|\s)\.community-reactions(?:\.feed-reactions)?$/.test(selector);
      if (!matches) continue;
      const attributes = selector.match(/\[[^\]]+\]/g) || [];
      const rest = selector.replace(/\[[^\]]+\]/g, "");
      assert.doesNotMatch(rest, /[:#]/, `Extend this specificity check for new selector syntax: ${selector}`);
      const classes = rest.match(/\.[\w-]+/g) || [];
      const tags = rest.replace(/\.[\w-]+/g, "").match(/[a-z][\w-]*/gi) || [];
      const specificity = (attributes.length + classes.length) * 100 + tags.length;
      rule.walkDecls((decl) => {
        const priority = [decl.important ? 1 : 0, specificity, ++order];
        const old = result.get(decl.prop);
        if (!old || priority[0] > old.priority[0] || (priority[0] === old.priority[0] && (priority[1] > old.priority[1] || (priority[1] === old.priority[1] && priority[2] > old.priority[2])))) {
          result.set(decl.prop, { value: decl.value, priority });
        }
      });
    }
  });
  return Object.fromEntries([...result].map(([key, declaration]) => [key, declaration.value]));
}

test("reaction CSS defeats legacy display:contents, full-width and four-column overrides regardless of import order", () => {
  for (const roots of [styles, [...styles].reverse()]) {
    const wrapper = declarationsFor(roots, 1280, "wrapper");
    assert.equal(wrapper.display, "flex");
    assert.equal(wrapper.position, "relative");
    const desktop = declarationsFor(roots, 1280, "picker");
    assert.equal(desktop.position, "absolute");
    assert.equal(desktop.width, "min(352px, calc(100vw - 48px))");
    assert.equal(desktop["max-width"], "none");
    assert.equal(desktop["grid-template-columns"], "minmax(0, 1fr)");
    assert.equal(desktop.margin, "0");
    assert.equal(desktop.padding, "8px 10px 12px");
    const mobile = declarationsFor(roots, 390, "picker");
    assert.equal(mobile.position, "absolute");
    assert.equal(mobile.width, "min(352px, calc(100vw - 48px))");
    assert.equal(mobile["grid-template-columns"], "minmax(0, 1fr)");
  }
});
