import { describe, expect, it } from "vitest";
import {
  answerValue,
  assertPublicResponseUpdateAllowed,
  deriveStatus,
  elementStatus,
  evidenceRef,
  LockedElementError,
  responseAnswers,
  statusKey,
  commentKey,
  hasAnswer,
  isAnswered,
  naKey,
  unitKey,
  upsertResponseInput,
} from "./response.js";

const sampleRef = { key: "evaluations/ev1/file-abc", name: "reporte.pdf", size: 1024, mimeType: "application/pdf" };

describe("evidenceRef", () => {
  it("acepta una referencia válida", () => {
    expect(evidenceRef.safeParse(sampleRef).success).toBe(true);
  });

  it("rechaza una referencia sin key", () => {
    const { success } = evidenceRef.safeParse({ name: "x.pdf", size: 1, mimeType: "application/pdf" });
    expect(success).toBe(false);
  });

  it("rechaza una referencia con tamaño negativo", () => {
    const { success } = evidenceRef.safeParse({ ...sampleRef, size: -1 });
    expect(success).toBe(false);
  });
});

describe("answerValue", () => {
  it.each(["texto", 42, ["a", "b"]])("acepta un valor válido de tipo %s", (value) => {
    expect(answerValue.safeParse(value).success).toBe(true);
  });

  it("acepta un array de refs de evidencia", () => {
    expect(answerValue.safeParse([sampleRef]).success).toBe(true);
  });

  it("acepta un array mixto de URLs y refs de evidencia (referencias flexibles VS-045)", () => {
    const result = answerValue.safeParse(["https://ejemplo.com/doc", sampleRef]);
    expect(result.success).toBe(true);
  });

  it("acepta un array legacy de strings (refs URL pre-VS-045)", () => {
    expect(answerValue.safeParse(["https://a.com", "https://b.com"]).success).toBe(true);
  });

  it("rechaza un objeto de un solo nivel (no matriz fila->columna->valor)", () => {
    const result = answerValue.safeParse({ text: "x" });
    expect(result.success).toBe(false);
  });

  it("rechaza un array de números", () => {
    const result = answerValue.safeParse([1, 2, 3]);
    expect(result.success).toBe(false);
  });

  it("acepta un valor de tabla_datos (mapa fila->columna->celda, VS-024)", () => {
    const result = answerValue.safeParse({ total: { fy2023: 120.5, fy2024: "n/d" } });
    expect(result.success).toBe(true);
  });

  it("rechaza un valor de tabla_datos con una celda booleana", () => {
    const result = answerValue.safeParse({ total: { fy2023: true } });
    expect(result.success).toBe(false);
  });
});

describe("responseAnswers", () => {
  it("acepta un mapa con varias claves", () => {
    const result = responseAnswers.safeParse({
      q1: "texto",
      q2: 5,
      q3: ["a", "b"],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un mapa con un valor inválido", () => {
    const result = responseAnswers.safeParse({ q1: { anidado: true } });
    expect(result.success).toBe(false);
  });
});

describe("upsertResponseInput", () => {
  it("acepta un input válido con answers", () => {
    const result = upsertResponseInput.safeParse({ answers: { q1: "ok" } });
    expect(result.success).toBe(true);
  });

  it("rechaza un input sin la clave answers", () => {
    const result = upsertResponseInput.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("elementStatus", () => {
  it("acepta completed", () => {
    expect(elementStatus.safeParse("completed").success).toBe(true);
  });

  it("acepta approved", () => {
    expect(elementStatus.safeParse("approved").success).toBe(true);
  });

  it("acepta submitted", () => {
    expect(elementStatus.safeParse("submitted").success).toBe(true);
  });

  it("rechaza pending", () => {
    expect(elementStatus.safeParse("pending").success).toBe(false);
  });
});

describe("deriveStatus", () => {
  it("retorna not_started cuando no hay estado explícito ni respuesta", () => {
    expect(deriveStatus(undefined, false)).toBe("not_started");
  });

  it("retorna in_progress cuando no hay estado explícito pero sí respuesta", () => {
    expect(deriveStatus(undefined, true)).toBe("in_progress");
  });

  it("retorna completed cuando el estado explícito es completed", () => {
    expect(deriveStatus("completed", true)).toBe("completed");
  });

  it("retorna approved cuando el estado explícito es approved aunque answered sea false", () => {
    expect(deriveStatus("approved", false)).toBe("approved");
  });

  it("retorna submitted cuando el estado explícito es submitted", () => {
    expect(deriveStatus("submitted", true)).toBe("submitted");
  });
});

describe("statusKey", () => {
  it("retorna la clave sintética con sufijo ::status", () => {
    expect(statusKey("el-1")).toBe("el-1::status");
  });
});

describe("assertPublicResponseUpdateAllowed", () => {
  it("no lanza cuando current está vacío e incoming tiene respuesta y status completed", () => {
    expect(() => {
      assertPublicResponseUpdateAllowed({}, { "el-1": "si", "el-1::status": "completed" });
    }).not.toThrow();
  });

  it("lanza LockedElementError cuando incoming intenta poner approved directo sin que current ya sea approved (Regla B)", () => {
    expect(() => {
      assertPublicResponseUpdateAllowed({}, { "el-1": "respuesta", "el-1::status": "approved" });
    }).toThrow(LockedElementError);
  });

  it("lanza LockedElementError cuando current es approved e incoming intenta cambiarlo a completed (Regla A)", () => {
    expect(() => {
      assertPublicResponseUpdateAllowed(
        { "el-1": "respuesta", "el-1::status": "approved" },
        { "el-1": "respuesta", "el-1::status": "completed" }
      );
    }).toThrow(LockedElementError);
  });

  it("lanza LockedElementError cuando current es submitted y incoming modifica la respuesta (Regla D)", () => {
    expect(() => {
      assertPublicResponseUpdateAllowed(
        { "el-1": "original", "el-1::status": "submitted" },
        { "el-1": "modificada", "el-1::status": "submitted" }
      );
    }).toThrow(LockedElementError);
  });

  it("lanza LockedElementError cuando incoming intenta completed sin respuesta real (Regla C)", () => {
    expect(() => {
      assertPublicResponseUpdateAllowed({}, { "el-1": "", "el-1::status": "completed" });
    }).toThrow(LockedElementError);
  });

  it("lanza LockedElementError cuando incoming intenta completed con respuesta ausente (Regla C)", () => {
    expect(() => {
      assertPublicResponseUpdateAllowed({}, { "el-1::status": "completed" });
    }).toThrow(LockedElementError);
  });

  it("no lanza cuando incoming marca completed con N/A y sin respuesta real (Regla C + VS-019, bug real corregido)", () => {
    expect(() => {
      assertPublicResponseUpdateAllowed({}, { "el-1::na": "true", "el-1::status": "completed" });
    }).not.toThrow();
  });
});

describe("naKey", () => {
  it("retorna la clave sintética con sufijo ::na", () => {
    expect(naKey("el-1")).toBe("el-1::na");
  });
});

describe("commentKey", () => {
  it("retorna la clave sintética con sufijo ::comment", () => {
    expect(commentKey("el-1")).toBe("el-1::comment");
  });
});

describe("unitKey", () => {
  it("retorna la clave sintética con sufijo ::unit", () => {
    expect(unitKey("el-1")).toBe("el-1::unit");
  });
});

describe("hasAnswer", () => {
  it("retorna false para una tabla_datos vacía", () => {
    expect(hasAnswer({})).toBe(false);
  });

  it("retorna false para una tabla_datos con filas pero sin celdas llenas", () => {
    expect(hasAnswer({ total: {} })).toBe(false);
  });

  it("retorna false para una tabla_datos con una celda vacía", () => {
    expect(hasAnswer({ total: { fy2023: "" } })).toBe(false);
  });

  it("retorna true para una tabla_datos con al menos una celda llena", () => {
    expect(hasAnswer({ total: { fy2023: "", fy2024: 120.5 } })).toBe(true);
  });
});

describe("isAnswered", () => {
  it("retorna false cuando no hay respuesta ni marcado N/A", () => {
    expect(isAnswered(undefined, undefined)).toBe(false);
  });

  it("retorna true cuando hay respuesta real", () => {
    expect(isAnswered("algo", undefined)).toBe(true);
  });

  it("retorna true cuando está marcado N/A sin respuesta", () => {
    expect(isAnswered(undefined, "true")).toBe(true);
  });

  it("retorna true cuando hay N/A aunque el valor sea string vacío", () => {
    expect(isAnswered("", "true")).toBe(true);
  });

  it("retorna false cuando na es 'false'", () => {
    expect(isAnswered(undefined, "false")).toBe(false);
  });
});
