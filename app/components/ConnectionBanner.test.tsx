import { describe, it, expect } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { ConnectionBanner } from "@/app/components/ConnectionBanner";
import { LanguageProvider } from "@/app/components/LanguageProvider";

function NL({ children }: { children: ReactNode }) {
  return <LanguageProvider initial="nl">{children}</LanguageProvider>;
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: NL });

describe("ConnectionBanner", () => {
  it("renders nothing when connected", () => {
    const { container } = render(<ConnectionBanner connected={true} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("shows a message when disconnected", () => {
    render(<ConnectionBanner connected={false} />);
    expect(screen.getByText(/verbinding met huis kwijt/i)).toBeInTheDocument();
  });
});
