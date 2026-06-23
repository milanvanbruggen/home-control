import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
});
