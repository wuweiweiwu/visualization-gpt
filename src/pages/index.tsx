import classnames from "classnames";
import qs from "qs";
import { useCallback, useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import embed from "vega-embed";

type Role = "assistant" | "user";

interface Tree {
  id: string;
  role: Role;
  content: string;
  children: Tree[];
}

export default function Home() {
  // TODO: Not good that it's a tree but that's okay
  const [forest, setForest] = useState<Tree[]>([
    {
      // set as a new uuid
      id: "root",
      role: "user",
      content: "",
      children: [],
    },
  ]);

  return (
    <main className="p-24 min-h-screen">
      <div className="-ml-6">
        {forest.map((tree) => (
          <Cell
            key={tree.id}
            tree={tree}
            setTree={(callback) => {
              setForest((forest) =>
                forest.map((otherTree) =>
                  otherTree.id === tree.id ? callback(otherTree) : otherTree
                )
              );
            }}
            transcript={[]}
            onDelete={
              forest.length > 1
                ? () =>
                    setForest((forest) =>
                      forest.filter((otherTree) => otherTree.id !== tree.id)
                    )
                : undefined
            }
          />
        ))}

        <Button
          className="mt-6"
          role="user"
          onClick={() => {
            setForest((forest) => [
              ...forest,
              {
                id: crypto.randomUUID(),
                role: "user",
                content: "",
                children: [],
              },
            ]);
          }}
        >
          + New thread
        </Button>
      </div>
    </main>
  );
}

const VegaEmbed = (props: { id: string; spec: any }) => {
  useEffect(() => {
    embed(`#${props.id}`, props.spec);
  }, [props.id, props.spec]);

  return <div id={props.id}></div>;
};

interface CellProps {
  tree: Tree;
  setTree: (callback: (tree: Tree) => Tree) => void;
  transcript: Tree[];
  onDelete?: () => void;
}

function Cell({ tree, setTree, onDelete, transcript }: CellProps) {
  const [expanded, setExpanded] = useState(true);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  // focus the input when it's added
  useEffect(() => {
    if (tree.role === "user") {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [tree.role]);

  const handleAskAiClick = useCallback(() => {
    // save an ID
    const id = crypto.randomUUID();
    // append a child with role assistant
    setTree((tree) => ({
      ...tree,
      children: [
        ...tree.children,
        {
          id,
          role: "assistant",
          content: "",
          children: [],
        },
      ],
    }));

    // transcript without any children fields
    const transcriptWithoutChildren: Record<string, string>[] = [
      ...transcript,
      tree,
    ].map((t) => ({
      role: t.role,
      content: t.content,
    }));
    const searchParams = qs.stringify({
      transcript: transcriptWithoutChildren,
    });

    const aiStream = new EventSource(`/api/ai?${searchParams}`);
    // cleanup?
    aiStream.addEventListener("message", (e) => {
      if (e.data === "[DONE]") {
        aiStream.close();
        return;
      }

      const message = JSON.parse(e.data);
      const delta = message.choices[0].delta.content;

      if (delta) {
        // update the child at idx
        setTree((tree) => ({
          ...tree,
          children: tree.children.map((c) =>
            c.id === id ? { ...c, content: c.content + delta } : c
          ),
        }));
      }
    });
  }, [setTree, transcript, tree]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleAskAiClick();
      } else if (e.key === "Backspace" && !e.shiftKey) {
        if (tree.content === "") {
          e.preventDefault();
          onDelete?.();
        }
      }
    },
    [onDelete, tree.content, handleAskAiClick]
  );

  const handleRegenerateAiClick = useCallback(() => {
    setTree((tree) => ({
      ...tree,
      content: "",
    }));

    // transcript without any children fields
    const transcriptWithoutChildren: Record<string, string>[] = transcript.map(
      (t) => ({
        role: t.role,
        content: t.content,
      })
    );
    const searchParams = qs.stringify({
      transcript: transcriptWithoutChildren,
    });

    const aiStream = new EventSource(`/api/ai?${searchParams}`);
    // cleanup?
    aiStream.addEventListener("message", (e) => {
      if (e.data === "[DONE]") {
        aiStream.close();
        return;
      }

      const message = JSON.parse(e.data);
      const delta = message.choices[0].delta.content;

      if (delta) {
        setTree((tree) => ({
          ...tree,
          content: tree.content + delta,
        }));
      }
    });
  }, [setTree, transcript]);

  const getCodeBlockContents = (content: string) => {
    const codeBlockRegex = /(?<=`{3})([\s\S]*?)(?=`{3})/g;
    const codeBlockMatches = content.match(codeBlockRegex);

    return codeBlockMatches?.[0];
  };

  const getNodes = (content: string) => {
    const specString = getCodeBlockContents(content);
    if (!specString) {
      return content;
    }

    const surrounding = content
      .split(specString)
      .map((s) => s.replace("```", ""));

    let spec = null;

    try {
      spec = JSON.parse(specString.replace(/(\r\n|\n|\r)/gm, ""));
    } catch (e) {
      console.error(e);
      return content;
    }

    return (
      <>
        {surrounding[0]}

        {spec && <VegaEmbed id={`chart-${tree.id}`} spec={spec} />}

        {surrounding[1]}
      </>
    );
  };

  return (
    <div className="w-full">
      <div className="mt-2 flex flex-row items-start gap-2">
        <Button
          disabled={!tree.children.length}
          disableHover
          className={classnames("mt-3 transition-transform", {
            "rotate-90": tree.children.length && expanded,
            "opacity-50": !tree.children.length,
          })}
          role="user"
          onClick={() => setExpanded(!expanded)}
        >
          ▶
        </Button>
        <div
          style={{
            width: 660,
          }}
          className={classnames("rounded-md", {
            "bg-purple-100": tree.role === "assistant",
            "py-2": tree.role === "user",
            "p-2": tree.role === "assistant",
            "w-full": tree.role === "user",
          })}
        >
          {tree.role === "user" ? (
            <TextareaAutosize
              placeholder="Type your message here..."
              ref={inputRef}
              className="p-1 resize-none w-full rounded-md bg-transparent outline-none"
              value={tree.content}
              onChange={(e) =>
                setTree((tree) => ({ ...tree, content: e.target.value }))
              }
              onKeyDown={handleKeyDown}
              rows={1}
            />
          ) : (
            <div className="p-1 flex flex-col gap-4">
              {getNodes(
                tree.content
                  ? tree.content.replace("```json", "```")
                  : "Thinking..."
              )}
            </div>
          )}

          <div className="flex flex-row gap-2">
            {tree.role === "user" && (
              <Button
                disabled={tree.content.trim().length === 0}
                role={tree.role}
                onClick={handleAskAiClick}
              >
                Ask AI ✨
              </Button>
            )}

            {tree.role === "assistant" && (
              <Button role={tree.role} onClick={handleRegenerateAiClick}>
                Regenerate 🔄
              </Button>
            )}

            <Button
              role={tree.role}
              onClick={() =>
                setTree((tree) => ({
                  ...tree,
                  children: [
                    ...tree.children,
                    {
                      id: crypto.randomUUID(),
                      role: "user",
                      content: "",
                      children: [],
                    },
                  ],
                }))
              }
            >
              Add child
            </Button>

            {onDelete && (
              <Button role={tree.role} onClick={onDelete}>
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {tree.children.length ? (
        <div
          className={classnames("ml-6", {
            hidden: !expanded,
          })}
        >
          {tree.children.map((child) => (
            <Cell
              key={child.id}
              tree={child}
              transcript={[...transcript, tree]}
              setTree={(callback) => {
                setTree((tree) => ({
                  ...tree,
                  children: tree.children.map((c) =>
                    c.id === child.id ? callback(c) : c
                  ),
                }));
              }}
              onDelete={() => {
                setTree((tree) => ({
                  ...tree,
                  children: tree.children.filter((c) => c.id !== child.id),
                }));
                // focus my input
                inputRef.current?.focus();
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  role: Role;
  className?: string;
  disableHover?: boolean;
  disabled?: boolean;
}
function Button({
  children,
  onClick,
  role,
  className,
  disableHover,
  disabled,
}: ButtonProps) {
  const isPurple = role === "assistant";

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={classnames("text-xs p-1 rounded-sm", className, {
        "hover:bg-slate-200": !disabled && !disableHover && !isPurple,
        "hover:bg-purple-200": !disabled && !disableHover && isPurple,
        "text-slate-500": !isPurple,
        "text-slate-600": isPurple,
        "opacity-50": disabled,
      })}
    >
      {children}
    </button>
  );
}
