import { describe, it, expect } from "vitest";
import { toTitleCase } from "@/lib/strings";

describe("toTitleCase", () => {
  it("capitalizes basic words", () => {
    expect(toTitleCase("BOAVISTA")).toBe("Boavista");
  });

  it("handles accented characters", () => {
    expect(toTitleCase("CAMPANHÃ")).toBe("Campanhã");
  });

  it("keeps Portuguese prepositions lowercase mid-string", () => {
    expect(toTitleCase("SENHORA DE HORA")).toBe("Senhora de Hora");
    expect(toTitleCase("ESTAÇÃO DO BOLHÃO")).toBe("Estação do Bolhão");
    expect(toTitleCase("PARQUE DA CIDADE")).toBe("Parque da Cidade");
    expect(toTitleCase("PRAÇA DOS LEÕES")).toBe("Praça dos Leões");
  });

  it("capitalizes preposition when it is the first word", () => {
    expect(toTitleCase("DE CODICEIRA")).toBe("De Codiceira");
  });

  it("handles dash-separated route names", () => {
    expect(toTitleCase("BOAVISTA - CAMPANHÃ")).toBe("Boavista - Campanhã");
  });

  it("handles already mixed-case input", () => {
    expect(toTitleCase("bolhão de codiceira")).toBe("Bolhão de Codiceira");
  });

  it("strips leading STCP asterisk from headsigns", () => {
    expect(toTitleCase("*codiceira")).toBe("Codiceira");
    expect(toTitleCase("*BOLHÃO")).toBe("Bolhão");
  });

  it("handles empty string", () => {
    expect(toTitleCase("")).toBe("");
  });
});
