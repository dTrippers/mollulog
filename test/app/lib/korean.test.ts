import { describe, expect, it } from "@jest/globals";
import { conjunctionParticle, withDirectionParticle, withObjectParticle } from "~/lib/korean";

describe("Korean particles", () => {
  it("picks 을/를 by the last syllable and ignores a variant in parentheses", () => {
    expect(withObjectParticle("아루")).toBe("아루를");
    expect(withObjectParticle("카린")).toBe("카린을");
    expect(withObjectParticle("카린(바니걸)")).toBe("카린(바니걸)을");
    expect(withObjectParticle("시로코(테러)")).toBe("시로코(테러)를");
  });

  it("reads a trailing digit as Korean for 으로/로", () => {
    expect(withDirectionParticle("★3")).toBe("★3으로");
    expect(withDirectionParticle("★2")).toBe("★2로");
    expect(withDirectionParticle("★1")).toBe("★1로");
    expect(withDirectionParticle("고유무기 4")).toBe("고유무기 4로");
    expect(withDirectionParticle("고유무기 3")).toBe("고유무기 3으로");
  });

  it("keeps 로 after a final ㄹ and after a vowel", () => {
    expect(withDirectionParticle("서울")).toBe("서울로");
    expect(withDirectionParticle("학교")).toBe("학교로");
    expect(withDirectionParticle("교실")).toBe("교실로");
    expect(withDirectionParticle("집")).toBe("집으로");
  });

  it("keeps the conjunction particle unchanged for plain words", () => {
    expect(conjunctionParticle("학생")).toBe("과");
    expect(conjunctionParticle("아이템")).toBe("과");
    expect(conjunctionParticle("스킬")).toBe("과");
    expect(conjunctionParticle("장비")).toBe("와");
  });
});
