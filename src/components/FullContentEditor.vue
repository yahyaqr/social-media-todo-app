<script setup lang="ts">
import { watch } from 'vue';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  CodeXml,
  Eraser,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  SquareCode,
  Strikethrough,
  TextQuote,
} from 'lucide-vue-next';

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  blur: [];
  commit: [];
}>();

const normalizeCopiedText = (value: string): string =>
  value.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

const getSelectedHtml = (): string => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return '';
  }

  const fragment = selection.getRangeAt(0).cloneContents();
  const container = document.createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
};

const htmlToPlainText = (html: string): string => {
  if (!html) {
    return '';
  }

  const container = document.createElement('div');
  container.innerHTML = html;

  const renderChildren = (node: Node, listContext?: { type: 'ul' | 'ol'; index: number }): string =>
    Array.from(node.childNodes)
      .map((child) => renderNode(child, listContext))
      .join('');

  const renderListItemText = (node: Node): string =>
    normalizeCopiedText(renderChildren(node).replace(/\n+/g, '\n'));

  const renderNode = (node: Node, listContext?: { type: 'ul' | 'ol'; index: number }): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }

    if (!(node instanceof HTMLElement)) {
      return '';
    }

    const tagName = node.tagName.toLowerCase();

    if (tagName === 'br') {
      return '\n';
    }

    if (tagName === 'ul' || tagName === 'ol') {
      let itemIndex = tagName === 'ol' ? Number(node.getAttribute('start') ?? '1') : 1;
      const lines = Array.from(node.children)
        .filter((child) => child.tagName.toLowerCase() === 'li')
        .map((child) => {
          const prefix = tagName === 'ol' ? `${itemIndex}. ` : '• ';
          const text = renderListItemText(child);
          itemIndex += 1;
          return text
            .split('\n')
            .map((line, index) => (index === 0 ? `${prefix}${line}` : `  ${line}`))
            .join('\n');
        });
      return `${lines.join('\n')}\n\n`;
    }

    if (tagName === 'li') {
      return renderChildren(node, listContext);
    }

    if (tagName === 'p' || tagName === 'blockquote' || tagName === 'pre') {
      return `${renderChildren(node)}\n\n`;
    }

    if (tagName === 'hr') {
      return `---\n\n`;
    }

    if (tagName === 'div') {
      return renderChildren(node);
    }

    return renderChildren(node, listContext);
  };

  return normalizeCopiedText(renderChildren(container));
};

const editor = useEditor({
  content: props.modelValue || '<p></p>',
  editorProps: {
    handleDOMEvents: {
      copy: (view, event) => {
        const clipboardEvent = event as ClipboardEvent;
        if (!clipboardEvent.clipboardData) {
          return false;
        }

        const { from, to, empty } = view.state.selection;
        if (empty) {
          return false;
        }

        const html = getSelectedHtml();
        const fallbackText = normalizeCopiedText(view.state.doc.textBetween(from, to, '\n'));
        const text = htmlToPlainText(html) || fallbackText;

        clipboardEvent.preventDefault();
        clipboardEvent.clipboardData.setData('text/plain', text);
        if (html) {
          clipboardEvent.clipboardData.setData('text/html', html);
        }
        return true;
      }
    },
    attributes: {
      class: 'full-editor min-h-[14rem] px-4 py-3 outline-none text-slate-900'
    }
  },
  extensions: [
    StarterKit.configure({
      heading: false
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      protocols: ['http', 'https']
    }),
    TaskList,
    TaskItem.configure({
      nested: true
    }),
    Placeholder.configure({
      placeholder:
        props.placeholder || 'Write notes... Tag people with @mention and topics with #tag.'
    })
  ],
  onUpdate: ({ editor: current }) => {
    const html = current.getHTML();
    emit('update:modelValue', html);
  },
  onBlur: () => {
    emit('blur');
    emit('commit');
  }
});

watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value) {
      return;
    }

    const current = editor.value.getHTML();
    const next = value || '<p></p>';
    if (current !== next) {
      editor.value.commands.setContent(next, { emitUpdate: false });
    }
  }
);

const toggleBold = (): void => {
  editor.value?.chain().focus().toggleBold().run();
  emit('commit');
};

const toggleItalic = (): void => {
  editor.value?.chain().focus().toggleItalic().run();
  emit('commit');
};

const toggleStrike = (): void => {
  editor.value?.chain().focus().toggleStrike().run();
  emit('commit');
};

const toggleCode = (): void => {
  editor.value?.chain().focus().toggleCode().run();
  emit('commit');
};

const clearNodes = (): void => {
  editor.value?.chain().focus().unsetAllMarks().clearNodes().run();
  emit('commit');
};

const toggleBulletList = (): void => {
  editor.value?.chain().focus().toggleBulletList().run();
  emit('commit');
};

const toggleOrderedList = (): void => {
  editor.value?.chain().focus().toggleOrderedList().run();
  emit('commit');
};

const toggleTaskList = (): void => {
  editor.value?.chain().focus().toggleTaskList().run();
  emit('commit');
};

const toggleCodeBlock = (): void => {
  editor.value?.chain().focus().toggleCodeBlock().run();
  emit('commit');
};

const toggleBlockquote = (): void => {
  editor.value?.chain().focus().toggleBlockquote().run();
  emit('commit');
};

const setHorizontalRule = (): void => {
  editor.value?.chain().focus().setHorizontalRule().run();
  emit('commit');
};

const setInlineLink = (): void => {
  if (!editor.value) {
    return;
  }

  const { from, to, empty } = editor.value.state.selection;
  const selectedText = empty ? '' : editor.value.state.doc.textBetween(from, to, ' ');
  const nextUrl = window.prompt('Enter link URL', '');
  if (nextUrl === null) {
    return;
  }

  const normalized = nextUrl.trim();
  if (!normalized) {
    editor.value.chain().focus().unsetLink().run();
    emit('commit');
    return;
  }

  const nextLabel = window.prompt('Enter link text', '');
  if (nextLabel === null) {
    return;
  }

  const label = nextLabel.trim() || selectedText || normalized;

  if (empty) {
    editor.value
      .chain()
      .focus()
      .insertContent(label)
      .setTextSelection({ from, to: from + label.length })
      .setLink({ href: normalized })
      .run();
  } else {
    editor.value
      .chain()
      .focus()
      .insertContentAt({ from, to }, label)
      .setTextSelection({ from, to: from + label.length })
      .setLink({ href: normalized })
      .run();
  }
  emit('commit');
};

</script>

<template>
  <div class="mt-5">
    <div class="mb-2">
      <h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">Full Content</h3>
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="editor-btn editor-btn-icon"
          :class="{ 'editor-btn-active': editor?.isActive('bold') }"
          title="Bold"
          @click="toggleBold"
        >
          <Bold class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="editor-btn editor-btn-icon"
          :class="{ 'editor-btn-active': editor?.isActive('italic') }"
          title="Italic"
          @click="toggleItalic"
        >
          <Italic class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="editor-btn editor-btn-icon"
          :class="{ 'editor-btn-active': editor?.isActive('strike') }"
          title="Strike"
          @click="toggleStrike"
        >
          <Strikethrough class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="editor-btn editor-btn-icon"
          :class="{ 'editor-btn-active': editor?.isActive('code') }"
          title="Inline code"
          @click="toggleCode"
        >
          <CodeXml class="h-4 w-4" />
        </button>
        <span class="editor-divider" aria-hidden="true" />

        <button
          type="button"
          class="editor-btn editor-btn-icon"
          :class="{ 'editor-btn-active': editor?.isActive('bulletList') }"
          title="Bullet list"
          @click="toggleBulletList"
        >
          <List class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="editor-btn editor-btn-icon"
          :class="{ 'editor-btn-active': editor?.isActive('orderedList') }"
          title="Ordered list"
          @click="toggleOrderedList"
        >
          <ListOrdered class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="editor-btn editor-btn-icon"
          :class="{ 'editor-btn-active': editor?.isActive('taskList') }"
          title="Checkbox list"
          @click="toggleTaskList"
        >
          <ListTodo class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="editor-btn editor-btn-icon"
          :class="{ 'editor-btn-active': editor?.isActive('blockquote') }"
          title="Quote"
          @click="toggleBlockquote"
        >
          <TextQuote class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="editor-btn editor-btn-icon"
          :class="{ 'editor-btn-active': editor?.isActive('codeBlock') }"
          title="Code block"
          @click="toggleCodeBlock"
        >
          <SquareCode class="h-4 w-4" />
        </button>
        <span class="editor-divider" aria-hidden="true" />

        <button
          type="button"
          class="editor-btn editor-btn-icon"
          :class="{ 'editor-btn-active': editor?.isActive('link') }"
          title="Link"
          @click="setInlineLink"
        >
          <Link2 class="h-4 w-4" />
        </button>
        <button type="button" class="editor-btn editor-btn-icon" title="Horizontal rule" @click="setHorizontalRule">
          <Minus class="h-4 w-4" />
        </button>
        <button type="button" class="editor-btn editor-btn-icon" title="Clear formatting" @click="clearNodes">
          <Eraser class="h-4 w-4" />
        </button>
      </div>
    </div>

    <div class="rounded-xl border border-slate-300 bg-white ring-blue-300 focus-within:ring-2">
      <EditorContent :editor="editor" />
    </div>
  </div>
</template>

<style scoped>
:deep(.editor-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  border-radius: 0.5rem;
  border: 1px solid rgb(203 213 225);
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1;
  color: rgb(51 65 85);
  background: white;
  vertical-align: middle;
}

:deep(.editor-btn-icon) {
  display: inline-grid;
  place-items: center;
  width: 2rem;
  min-width: 2rem;
  height: 2rem;
  min-height: 2rem;
  padding: 0;
}

:deep(.editor-divider) {
  height: 1.25rem;
  width: 1px;
  background: rgb(203 213 225);
}

:deep(.editor-btn:hover) {
  background: rgb(241 245 249);
}

:deep(.editor-btn-active) {
  background: rgb(219 234 254);
  color: rgb(30 64 175);
  border-color: rgb(147 197 253);
}

:deep(.editor-btn svg) {
  display: block;
  flex-shrink: 0;
}

:deep(.editor-btn-icon svg) {
  width: 1rem;
  height: 1rem;
}

:deep(.full-editor p.is-editor-empty:first-child::before) {
  color: rgb(148 163 184);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

:deep(.full-editor p) {
  line-height: 1.45;
  margin: 0;
}

:deep(.full-editor p + p) {
  margin-top: 1.15rem;
}

:deep(.full-editor ul[data-type='taskList']) {
  list-style: none;
  padding-left: 0.25rem;
}

:deep(.full-editor ul:not([data-type='taskList'])) {
  list-style: disc;
  padding-left: 1.25rem;
  margin: 0.4rem 0;
}

:deep(.full-editor ol) {
  list-style: decimal;
  padding-left: 1.25rem;
  margin: 0.4rem 0;
}

:deep(.full-editor li) {
  margin: 0.15rem 0;
}

:deep(.full-editor ul[data-type='taskList'] li) {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

:deep(.full-editor ul[data-type='taskList'] li > label) {
  margin-top: 0.15rem;
}

:deep(.full-editor a) {
  color: rgb(29 78 216);
  text-decoration: underline;
}

:deep(.full-editor blockquote) {
  border-left: 3px solid rgb(148 163 184);
  color: rgb(71 85 105);
  margin: 0.5rem 0;
  padding-left: 0.75rem;
}

:deep(.full-editor code) {
  background: rgb(241 245 249);
  border-radius: 0.25rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.85em;
  padding: 0.1rem 0.3rem;
}

:deep(.full-editor pre) {
  background: rgb(15 23 42);
  border-radius: 0.5rem;
  color: rgb(226 232 240);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  margin: 0.6rem 0;
  overflow-x: auto;
  padding: 0.7rem 0.9rem;
}

:deep(.full-editor pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
}
</style>
