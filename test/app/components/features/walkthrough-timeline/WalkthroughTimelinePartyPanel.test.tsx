import { describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { useNavigation } from "react-router";
import WalkthroughTimelinePartyPanel from "~/components/features/walkthrough-timeline/WalkthroughTimelinePartyPanel";

jest.mock("react-router", () => ({
  ...jest.requireActual<typeof import("react-router")>("react-router"),
  useNavigation: jest.fn(),
}));

const mockedUseNavigation = useNavigation as jest.MockedFunction<typeof useNavigation>;

const panelProps = {
  mode: "create" as const,
  parties: [],
  students: [],
  activePartyIndex: 0,
  onChange: jest.fn(),
  onAddParty: jest.fn(),
  onDeleteParty: jest.fn(),
  onSave: jest.fn(),
  onUndo: jest.fn(),
  onRedo: jest.fn(),
  canUndo: false,
  canRedo: false,
};

describe("WalkthroughTimelinePartyPanel save control", () => {
  it("shows the active saving state and disables the initiating control", () => {
    mockedUseNavigation.mockReturnValue({ state: "submitting" } as ReturnType<typeof useNavigation>);

    const markup = renderToStaticMarkup(<WalkthroughTimelinePartyPanel {...panelProps} />);

    expect(markup).toContain(">저장 중...</button>");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("타임라인 저장");
  });

  it("renders one actionable alert beside the retryable save control", () => {
    mockedUseNavigation.mockReturnValue({ state: "idle" } as ReturnType<typeof useNavigation>);

    const markup = renderToStaticMarkup(
      <WalkthroughTimelinePartyPanel {...panelProps} error="타임라인을 저장하지 못했어요." />,
    );

    expect(markup.match(/role="alert"/g)).toHaveLength(1);
    expect(markup.match(/타임라인을 저장하지 못했어요\./g)).toHaveLength(1);
    expect(markup).toContain('<p class="font-semibold">타임라인을 저장하지 못했어요.</p>');
    expect(markup).toContain(">타임라인 저장</button>");
    expect(markup).not.toContain("저장 중...");
  });
});
