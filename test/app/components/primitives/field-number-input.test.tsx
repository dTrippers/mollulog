import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import Field from "~/components/primitives/Field";
import NumberInput from "~/components/primitives/NumberInput";

describe("Field with NumberInput", () => {
  it("renders labelled textbox controls with unique ids and forwards descriptions to the input", () => {
    const markup = renderToStaticMarkup(
      <div>
        <Field label="계정 레벨" htmlFor="account-level" description="1부터 90까지" error="레벨을 확인해주세요">
          <NumberInput value={85} minValue={1} maxValue={90} onChange={() => {}} />
        </Field>
        <Field label="카페 랭크" htmlFor="cafe-rank">
          <NumberInput value={8} minValue={1} maxValue={10} onChange={() => {}} />
        </Field>
      </div>,
    );

    for (const [label, id] of [
      ["계정 레벨", "account-level"],
      ["카페 랭크", "cafe-rank"],
    ]) {
      expect(markup).toContain(`<label class="block text-sm font-semibold text-foreground" for="${id}">${label}</label>`);
      const input = markup.match(new RegExp(`<input\\b(?=[^>]*\\bid="${id}")[^>]*>`))?.[0];
      expect(input).toBeDefined();
      // A text input has the implicit textbox role; the matching visible label supplies its accessible name.
      expect(input).toContain('type="text"');
      expect([...markup.matchAll(new RegExp(`\\bid="${id}"`, "g"))]).toHaveLength(1);
    }

    expect(markup).toContain('aria-describedby="account-level-description account-level-error"');
    expect(markup).toContain('aria-invalid="true"');
  });
});
