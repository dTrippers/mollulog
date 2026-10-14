import { describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import RaidRankFilter, {
  type RaidRankFilterState,
  updateFilterNotOwned,
} from "~/components/features/raids/RaidRankFilter";

jest.mock("~/contexts/SignInProvider", () => ({
  useSignIn: () => ({ showSignIn: jest.fn() }),
}));

function renderFilter({ state, signedIn }: { state: RaidRankFilterState; signedIn: boolean }) {
  return renderToStaticMarkup(
    <RaidRankFilter
      state={state}
      setState={jest.fn()}
      filterableStudents={[]}
      filterableDifficulties={[]}
      signedIn={signedIn}
      onClearExactParties={jest.fn()}
    />,
  );
}

const baseState: RaidRankFilterState = {
  filterNotOwned: false,
  allowBorrowedStudent: false,
  exactParties: [],
  includeStudents: [],
  excludeStudents: [],
  difficulty: null,
};

describe("RaidRankFilter assist switch", () => {
  it("shows the assist switch only under an enabled owned-student filter", () => {
    const hiddenState = { ...baseState, filterNotOwned: false, allowBorrowedStudent: true };
    expect(renderFilter({ state: hiddenState, signedIn: true })).not.toContain("조력자 1명 허용");

    const visibleMarkup = renderFilter({
      state: { ...hiddenState, filterNotOwned: true },
      signedIn: true,
    });
    expect(visibleMarkup).toContain("조력자 1명 허용");
    expect(visibleMarkup).toContain("전체 편성 중 미모집 1명");
    expect(visibleMarkup).toMatch(/<label[^>]*>조력자 1명 허용<\/label>/);
    expect(visibleMarkup).toContain('aria-checked="true"');
  });

  it("preserves the assist option while the parent setting is turned off and on", () => {
    const initialState = { ...baseState, filterNotOwned: true, allowBorrowedStudent: true };
    const hiddenState = updateFilterNotOwned(initialState, false);
    const restoredState = updateFilterNotOwned(hiddenState, true);

    expect(hiddenState.allowBorrowedStudent).toBe(true);
    expect(renderFilter({ state: hiddenState, signedIn: true })).not.toContain("조력자 1명 허용");
    expect(restoredState.allowBorrowedStudent).toBe(true);
    expect(renderFilter({ state: restoredState, signedIn: true })).toContain("조력자 1명 허용");
  });

  it("keeps the assist setting hidden and the parent switch disabled for guests", () => {
    const markup = renderFilter({
      state: { ...baseState, filterNotOwned: false, allowBorrowedStudent: true },
      signedIn: false,
    });

    expect(markup).not.toContain("조력자 1명 허용");
    expect(markup).toMatch(/<label[^>]*>내가 모집하지 않은 학생<\/label>/);
    expect(markup).toContain('aria-checked="false"');
    expect(markup).toContain('disabled=""');
  });
});
