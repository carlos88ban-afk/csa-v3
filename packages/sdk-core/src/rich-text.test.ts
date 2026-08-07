import { describe, expect, it } from "vitest";
import { sanitizeCommentHtml, stripCommentHtml } from "./rich-text.js";

describe("sanitizeCommentHtml", () => {
  it("conserva los tags permitidos (negrita/itálica/lista/párrafo)", () => {
    const html = "<p><strong>Hola</strong> <em>mundo</em></p><ul><li>Uno</li><li>Dos</li></ul>";
    expect(sanitizeCommentHtml(html)).toBe(html);
  });

  it("elimina tags fuera de la allowlist pero conserva el texto interno", () => {
    expect(sanitizeCommentHtml("<h1>Título</h1>")).toBe("Título");
  });

  it("elimina <script> por completo, incluido su contenido", () => {
    expect(sanitizeCommentHtml('<p>hola</p><script>alert("xss")</script>')).toBe("<p>hola</p>");
  });

  it("elimina atributos de evento inline (onerror, onclick)", () => {
    const html = '<p onclick="alert(1)">hola</p><img src="x" onerror="alert(1)" />';
    const result = sanitizeCommentHtml(html);
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("<img");
  });

  it("elimina href javascript: en un tag no permitido igual que cualquier otro", () => {
    const result = sanitizeCommentHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("<a");
  });

  it("recorta espacio en blanco al inicio/fin", () => {
    expect(sanitizeCommentHtml("  <p>hola</p>  ")).toBe("<p>hola</p>");
  });

  it("string vacío da string vacío", () => {
    expect(sanitizeCommentHtml("")).toBe("");
  });
});

describe("stripCommentHtml", () => {
  it("despoja todos los tags y deja texto plano", () => {
    expect(stripCommentHtml("<p><strong>Hola</strong> <em>mundo</em></p>")).toBe("Hola mundo");
  });

  it("convierte párrafos y saltos de línea adyacentes en salto de línea, sin concatenar palabras", () => {
    expect(stripCommentHtml("<p>Hola</p><p>Mundo</p>")).toBe("Hola\nMundo");
  });

  it("convierte <br> en salto de línea", () => {
    expect(stripCommentHtml("Hola<br>Mundo")).toBe("Hola\nMundo");
  });

  it("convierte items de lista en líneas separadas", () => {
    expect(stripCommentHtml("<ul><li>Uno</li><li>Dos</li></ul>")).toBe("Uno\nDos");
  });

  it("neutraliza <script> — ni el tag ni su contenido aparecen en el texto plano", () => {
    expect(stripCommentHtml('<p>hola</p><script>alert("xss")</script>')).toBe("hola");
  });

  it("string vacío da string vacío", () => {
    expect(stripCommentHtml("")).toBe("");
  });
});
