const extension = {
  plugins({ pmState: { Plugin }, getContext }) {
    const { appEvents } = getContext();

    const swapImagePlugin = new Plugin({
      view(editorView) {
        const onSwap = ({ oldShortUrl, newUpload, handledRef }) => {
          const { doc } = editorView.state;
          let found = null;

          doc.descendants((node, pos) => {
            if (found) {
              return false;
            }

            if (
              node.type.name === "image" &&
              (node.attrs.originalSrc === oldShortUrl ||
                node.attrs.src === oldShortUrl)
            ) {
              found = { node, pos };
            }
          });

          if (!found) {
            return;
          }

          handledRef.value = true;

          const tr = editorView.state.tr.setNodeMarkup(found.pos, null, {
            ...found.node.attrs,
            src: newUpload.url || newUpload.short_url,
            originalSrc: newUpload.short_url,
          });

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
