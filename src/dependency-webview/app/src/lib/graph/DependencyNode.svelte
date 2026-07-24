<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { getTypeStyle } from "./typeStyles";
  import type { DependencyFlowNodeData } from "./grouping";

  let { data, selected }: NodeProps & { data: DependencyFlowNodeData } = $props();

  const style = $derived(getTypeStyle(data.node.type));
  const Icon = $derived(style.icon);
</script>

<div class="dep-node" class:selected style="--accent: {style.color}">
  <Handle type="target" position={Position.Top} isConnectable={false} />
  <span class="chip" title={style.label}><Icon /></span>
  <div class="text">
    <span class="label" title={data.node.label}>{data.node.label}</span>
    {#if (data.node.type === "cloud-rule" || data.node.type === "connector-rule") && data.node.attributes?.attachment}
      <span class="sublabel" title={data.node.attributes.attachment}>{data.node.attributes.attachment}</span>
    {/if}
  </div>
  <Handle type="source" position={Position.Bottom} isConnectable={false} />
</div>

<style>
  .dep-node {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 220px;
    padding: 6px 10px;
    border-radius: 6px;
    border: 2px solid var(--accent);
    background: var(--vscode-editorWidget-background, #252526);
    color: var(--vscode-editorWidget-foreground, #ccc);
    font-size: 12px;
  }

  .dep-node.selected {
    outline: 2px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: 1px;
  }

  .chip {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    background: var(--accent);
    color: #1e1e1e;
    border-radius: 4px;
    font-size: 11px;
  }

  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sublabel {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 10px;
    color: var(--vscode-descriptionForeground, rgba(204, 204, 204, 0.7));
  }

  /* Required by xyflow for edge bookkeeping, but FloatingEdge ignores their position, so they
     don't need to be visible or anchor edges to a fixed point. */
  .dep-node :global(.svelte-flow__handle) {
    opacity: 0;
    pointer-events: none;
  }
</style>
