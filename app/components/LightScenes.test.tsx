import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { LightScenes } from "@/app/components/LightScenes";

const scenes = [
  { id: "scene.woonkamer_ontspannen", name: "Ontspannen" },
  { id: "scene.woonkamer_uit", name: "Uit" },
];

describe("LightScenes", () => {
  it("renders a button per scene", () => {
    render(<LightScenes scenes={scenes} onScene={() => {}} />);
    expect(screen.getByRole("button", { name: "Ontspannen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uit" })).toBeInTheDocument();
  });

  it("calls onScene with the scene id on click", () => {
    const onScene = vi.fn();
    render(<LightScenes scenes={scenes} onScene={onScene} />);
    fireEvent.click(screen.getByRole("button", { name: "Ontspannen" }));
    expect(onScene).toHaveBeenCalledWith("scene.woonkamer_ontspannen");
  });

  it("renders no intensity slider when no light is provided", () => {
    render(<LightScenes scenes={scenes} onScene={() => {}} />);
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("debounces the intensity slider and reports the final brightness", () => {
    vi.useFakeTimers();
    const onBrightness = vi.fn();
    render(
      <LightScenes
        scenes={scenes}
        onScene={() => {}}
        light={{ id: "light.woonkamer", name: "Woonkamer", on: true, brightness: 40 }}
        onBrightness={onBrightness}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Helderheid" });
    fireEvent.change(slider, { target: { value: "70" } });
    expect(onBrightness).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(350); });
    expect(onBrightness).toHaveBeenCalledWith("light.woonkamer", 70);
    vi.useRealTimers();
  });

  it("disables the tapped scene tile while its action is in flight", () => {
    const onScene = vi.fn(() => new Promise<boolean>(() => {})); // never resolves
    render(<LightScenes scenes={scenes} onScene={onScene} />);
    const btn = screen.getByRole("button", { name: "Ontspannen" });
    fireEvent.click(btn);
    expect(onScene).toHaveBeenCalledWith("scene.woonkamer_ontspannen");
    expect(btn).toBeDisabled();
    expect(screen.getByRole("button", { name: "Uit" })).not.toBeDisabled();
  });

  it("hides the 'Alle scenes' button when no allScenes are provided", () => {
    render(<LightScenes scenes={scenes} onScene={() => {}} />);
    expect(screen.queryByRole("button", { name: /Alle scenes/i })).toBeNull();
  });

  it("opens a modal listing all scenes, activates one, and closes", () => {
    const onScene = vi.fn();
    const allScenes = [
      { id: "scene.woonkamer_ontspannen", name: "Ontspannen" },
      { id: "scene.woonkamer_vlammen", name: "Vlammen" },
      { id: "scene.woonkamer_energie", name: "Energie" },
    ];
    render(<LightScenes scenes={scenes} allScenes={allScenes} onScene={onScene} />);

    fireEvent.click(screen.getByRole("button", { name: /Alle scenes/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Alle scenes" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Vlammen" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Energie" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Vlammen" }));
    expect(onScene).toHaveBeenCalledWith("scene.woonkamer_vlammen");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("marks the 'Uit' tile with a power icon (and regular scenes have none)", () => {
    const withUit = [
      { id: "scene.woonkamer_ontspannen", name: "Ontspannen" },
      { id: "woonkamer_uit", name: "Uit" },
    ];
    render(<LightScenes scenes={withUit} onScene={() => {}} />);
    expect(screen.getByRole("button", { name: "Uit" }).querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ontspannen" }).querySelector("svg")).toBeNull();
  });
});
