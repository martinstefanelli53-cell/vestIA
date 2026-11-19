import { describe, expect, it } from "vitest";
import { nearestColorName } from "./image";

describe("nombre de color", () => {
  it.each([
    [[50, 50, 56], "negro"], [[20, 22, 30], "negro"], [[90, 90, 92], "gris"], [[142, 142, 142], "gris"], [[240, 240, 240], "blanco"],
    [[198, 40, 40], "rojo"], [[79, 111, 148], "denim"], [[31, 42, 68], "azul marino"], [[243, 236, 220], "crema"],
    [[46, 125, 79], "verde"], [[232, 165, 184], "rosa"],
  ] as [[number, number, number], string][])("%j → %s", (rgb, name) => {
    expect(nearestColorName(rgb)).toBe(name);
  });
});
