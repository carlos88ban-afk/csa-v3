"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { sanitizeCommentHtml } from "@plataforma-csa/sdk-core";

// Editor WYSIWYG genérico (negrita/itálica/lista/párrafo) — mismo motor que
// el comentario confidencial (VS-030, docs/adr/0006): TipTap reducido +
// sanitizeCommentHtml (packages/sdk-core/src/rich-text.ts, allowlist
// strong/em/p/br/ul/li). Extraído a componente compartido en VS-038 para
// que el contenido del banner (docs/engines/form.md) también acepte texto
// pegado con formato sin duplicar la config de TipTap una tercera vez — ver
// NaCommentRow en apps/web/app/evaluations/[token]/page.tsx para el caso
// con límite de caracteres (este componente no impone ninguno).
export function RichTextEditor({
  value,
  onChange,
  ariaLabel,
  label,
  disabled,
}: {
  value: string;
  onChange: (html: string) => void;
  ariaLabel: string;
  /** Texto visible arriba del editor — si se omite, el componente no renderiza field__label (el caller ya tiene uno propio). */
  label?: string;
  disabled?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    content: value,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
        orderedList: false,
      }),
    ],
    editorProps: {
      attributes: { "aria-label": ariaLabel, class: "comment-editor__content" },
    },
    onUpdate: ({ editor: e }) => onChange(sanitizeCommentHtml(e.getHTML())),
  });

  // Sincroniza cuando `value` cambia por una razón EXTERNA al propio editor
  // (mismo criterio que NaCommentRow) — no en cada tecleo.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div className="field">
      {label && <span className="field__label">{label}</span>}
      <div className="rich-toolbar" role="toolbar" aria-label={`Formato — ${ariaLabel}`}>
        <button
          type="button"
          aria-pressed={editor?.isActive("bold") ?? false}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          aria-label="Negrita"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          aria-pressed={editor?.isActive("italic") ?? false}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          aria-label="Itálica"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          aria-pressed={editor?.isActive("bulletList") ?? false}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          aria-label="Lista"
        >
          •
        </button>
      </div>
      <EditorContent editor={editor} className="comment-editor" />
    </div>
  );
}
