const extension = {
  plugins({ pmState: { Plugin, NodeSelection }, getContext }) {
    const { appEvents } = getContext();

    const swapImagePlugin = new Plugin({
      view(editorView) {
        const onSwap = ({
          oldShortUrl,
          newUpload,
          ordinal = 0,
          handledRef,
        }) => {
          const { doc } = editorView.state;
          let found = null;
          let seen = 0;

          doc.descendants((node, pos) => {
            if (found) {
              return false;
            }

            if (
              node.type.name === "image" &&
              (node.attrs.originalSrc === oldShortUrl ||
                node.attrs.src === oldShortUrl)
            ) {
              if (seen === ordinal) {
                found = { node, pos };
                return false;
              }
              seen++;
            }
          });

          if (!found) {
            return;
          }

          handledRef.value = true;

          const wasSelected =
            editorView.state.selection instanceof NodeSelection &&
            editorView.state.selection.from === found.pos;

          const tr = editorView.state.tr.setNodeMarkup(found.pos, null, {
            ...found.node.attrs,
            src: newUpload.url || newUpload.short_url,
            originalSrc: newUpload.short_url,
          });

          if (wasSelected) {
            tr.setSelection(NodeSelection.create(tr.doc, found.pos));
          }

          editorView.dispatch(tr);
        };

        appEvents.on("discourse-watermark:swap-image", onSwap);

        return {
          destroy() {
            appEvents.off("discourse-watermark:swap-image", onSwap);
          },
        };
      },
    });

    return [swapImagePlugin];
  },
};

export default extension;
