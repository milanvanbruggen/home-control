import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, fireEvent, act, within } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { LightScenes } from "@/app/components/LightScenes";
import { LanguageProvider } from "@/app/components/LanguageProvider";
import type { RoomState } from "@/lib/types";

// Render inside the Dutch provider so these assertions keep testing the NL strings.
function NL({ children }: { children: ReactNode }) {
  return <LanguageProvider initial="nl">{children}</LanguageProvider>;
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: NL });

function makeRooms(): RoomState[] {
  return [
    {
      key: "woonkamer", name: "Woonkamer", lightId: "light.woonkamer", on: true, brightness: 40,
      scenes: [
        { id: "scene.woonkamer_ontspannen", name: "Ontspannen" },
        { id: "scene.woonkamer_vlammen", name: "Vlammen" },
      ],
      favorites: ["scene.woonkamer_ontspannen", "scene.woonkamer_vlammen"],
      activeScene: null,
    },
    {
      key: "keuken", name: "Keuken", lightId: "light.keuken", on: false, brightness: 0,
      scenes: [
        { id: "scene.keuken_helder", name: "Keuken Helder" },
        { id: "scene.keuken_gedimd", name: "Keuken Gedimd" },
      ],
      favorites: ["scene.keuken_helder", "scene.keuken_gedimd"],
      activeScene: null,
    },
  ];
}

describe("LightScenes (multi-room)", () => {
  it("renders the default room's scenes + an Uit tile", () => {
    render(<LightScenes rooms={makeRooms()} onScene={() => {}} />);
    expect(screen.getByRole("heading", { name: "Woonkamer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ontspannen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vlammen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uit" })).toBeInTheDocument();
  });

  it("uses the scene's real gradient when present, falls back otherwise", () => {
    const rooms = makeRooms();
    rooms[0].scenes[0].gradient = "linear-gradient(135deg, rgb(1, 2, 3), rgb(4, 5, 6))"; // real Hue gradient (135deg)
    render(<LightScenes rooms={rooms} onScene={() => {}} />);
    // Ontspannen has the real gradient (135deg); Vlammen falls back to the keyword color (150deg)
    expect(screen.getByRole("button", { name: "Ontspannen" }).style.backgroundImage).toContain("135deg");
    expect(screen.getByRole("button", { name: "Vlammen" }).style.backgroundImage).toContain("150deg");
  });

  it("activates a scene on click", () => {
    const onScene = vi.fn();
    render(<LightScenes rooms={makeRooms()} onScene={onScene} />);
    fireEvent.click(screen.getByRole("button", { name: "Ontspannen" }));
    expect(onScene).toHaveBeenCalledWith("scene.woonkamer_ontspannen");
  });

  it("the Uit tile sends the room's uit id", () => {
    const onScene = vi.fn();
    render(<LightScenes rooms={makeRooms()} onScene={onScene} />);
    fireEvent.click(screen.getByRole("button", { name: "Uit" }));
    expect(onScene).toHaveBeenCalledWith("woonkamer_uit");
  });

  it("debounces the brightness slider for the selected room", () => {
    vi.useFakeTimers();
    const onBrightness = vi.fn();
    render(<LightScenes rooms={makeRooms()} onScene={() => {}} onBrightness={onBrightness} />);
    const slider = screen.getByRole("slider", { name: "Helderheid" });
    fireEvent.change(slider, { target: { value: "70" } });
    expect(onBrightness).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(350); });
    expect(onBrightness).toHaveBeenCalledWith("light.woonkamer", 70);
    vi.useRealTimers();
  });

  it("shows a saving spinner while a brightness change is pending, then clears it once the poll confirms", () => {
    const onBrightness = vi.fn();
    const { container, rerender } = render(
      <LightScenes rooms={makeRooms()} onScene={() => {}} onBrightness={onBrightness} />,
    );
    fireEvent.change(screen.getByRole("slider", { name: "Helderheid" }), { target: { value: "70" } });
    // Optimistic value is in flight → the saving spinner is visible.
    expect(container.querySelector(".animate-spin")).toBeTruthy();

    // The poll catches up: the room now reports brightness 70 → spinner clears.
    const confirmed = makeRooms();
    confirmed[0].brightness = 70;
    rerender(<LightScenes rooms={confirmed} onScene={() => {}} onBrightness={onBrightness} />);
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("clears a stuck brightness spinner via the fallback even if the poll never confirms", () => {
    vi.useFakeTimers();
    const onBrightness = vi.fn();
    const { container } = render(
      <LightScenes rooms={makeRooms()} onScene={() => {}} onBrightness={onBrightness} />,
    );
    fireEvent.change(screen.getByRole("slider", { name: "Helderheid" }), { target: { value: "70" } });
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(6000); }); // fallback fires; no poll ever confirmed
    expect(container.querySelector(".animate-spin")).toBeNull();
    vi.useRealTimers();
  });

  it("switches rooms via the room menu", () => {
    render(<LightScenes rooms={makeRooms()} onScene={() => {}} />);
    expect(screen.queryByRole("button", { name: "Keuken Helder" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ruimte wisselen/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Keuken" }));
    expect(screen.getByRole("heading", { name: "Keuken" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keuken Helder" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ontspannen" })).toBeNull();
  });

  it("opens the 'Alle scenes' modal, activates a scene, and closes", () => {
    const onScene = vi.fn();
    render(<LightScenes rooms={makeRooms()} onScene={onScene} />);
    fireEvent.click(screen.getByRole("button", { name: /Alle scenes/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Vlammen" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Vlammen" }));
    expect(onScene).toHaveBeenCalledWith("scene.woonkamer_vlammen");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("marks an active grid scene as pressed (and only that one)", () => {
    const rooms = makeRooms();
    rooms[0].activeScene = "scene.woonkamer_vlammen";
    render(<LightScenes rooms={rooms} onScene={() => {}} />);
    expect(screen.getByRole("button", { name: "Vlammen" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Ontspannen" })).toHaveAttribute("aria-pressed", "false");
  });

  it("clears the active badge optimistically when the room is turned off (Uit)", () => {
    const rooms = makeRooms();
    rooms[0].activeScene = "scene.woonkamer_vlammen";
    render(<LightScenes rooms={rooms} onScene={() => {}} />);
    expect(screen.getByRole("button", { name: "Vlammen" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Uit" }));
    expect(screen.getByRole("button", { name: "Vlammen" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the active scene name even when it is beyond the grid", () => {
    const rooms: RoomState[] = [
      {
        key: "woonkamer", name: "Woonkamer", lightId: "light.woonkamer", on: true, brightness: 50,
        scenes: [
          { id: "s1", name: "Een" }, { id: "s2", name: "Twee" }, { id: "s3", name: "Drie" },
          { id: "s4", name: "Vier" }, { id: "s5", name: "Vijf" }, { id: "s6", name: "Zes" },
          { id: "s7", name: "Zeven" }, { id: "s8", name: "Acht" },
        ],
        favorites: ["s1", "s2", "s3", "s4", "s5", "s6"],
        activeScene: "s8",
      },
    ];
    render(<LightScenes rooms={rooms} onScene={() => {}} />);
    // s8 is not a favorite → no grid tile, but its name shows under the title
    expect(screen.queryByRole("button", { name: "Acht" })).toBeNull();
    expect(screen.getByText("Acht")).toBeInTheDocument();
  });

  it("shows only favorites in the grid; non-favorites live in the modal", () => {
    const rooms: RoomState[] = [
      {
        key: "woonkamer", name: "Woonkamer", lightId: "light.woonkamer", on: true, brightness: 50,
        scenes: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }],
        favorites: ["a"],
        activeScene: null,
      },
    ];
    render(<LightScenes rooms={rooms} onScene={() => {}} />);
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument(); // favorite → grid
    expect(screen.queryByRole("button", { name: "Beta" })).toBeNull(); // non-favorite → not in grid
    fireEvent.click(screen.getByRole("button", { name: /Alle scenes/i }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Beta" })).toBeInTheDocument();
  });

  it("the 'Alle lampen uit' button turns off the whole house", () => {
    const onBrightness = vi.fn();
    render(<LightScenes rooms={makeRooms()} onScene={() => {}} onBrightness={onBrightness} />);
    fireEvent.click(screen.getByRole("button", { name: /Alle lampen uit/i }));
    expect(onBrightness).toHaveBeenCalledWith("all", 0);
  });
});

describe("LightScenes battery icon", () => {
  it("shows a battery icon with the % in its label when batteryPct is set", () => {
    const rooms: RoomState[] = [
      {
        key: "woonkamer", name: "Woonkamer", lightId: "light.woonkamer", on: true, brightness: 40,
        scenes: [], favorites: [], activeScene: null, batteryPct: 82,
      },
    ];
    render(<LightScenes rooms={rooms} onScene={() => {}} />);
    expect(screen.getByLabelText("Battery 82%")).toBeTruthy();
  });

  it("shows no battery icon when batteryPct is null", () => {
    const rooms: RoomState[] = [
      {
        key: "woonkamer", name: "Woonkamer", lightId: "light.woonkamer", on: true, brightness: 40,
        scenes: [], favorites: [], activeScene: null, batteryPct: null,
      },
    ];
    render(<LightScenes rooms={rooms} onScene={() => {}} />);
    expect(screen.queryByLabelText(/Battery/)).toBeNull();
  });
});
