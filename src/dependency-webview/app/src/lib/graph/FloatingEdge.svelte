<script lang="ts">
  import { BaseEdge, useInternalNode, getStraightPath, type EdgeProps } from "@xyflow/svelte";
  import { getFloatingEdgeParams } from "./floatingEdgeParams";
  import type { DependencyFlowNodeData } from "./grouping";

  let { id, source, target, label }: EdgeProps = $props();

  const sourceNode = $derived(useInternalNode(source));
  const targetNode = $derived(useInternalNode(target));

  const ruleEdgeLabel = $derived.by(() => {
    if (!label || targetNode.current?.data?.kind !== "dependency") {
      return undefined;
    }
    const type = (targetNode.current.data as DependencyFlowNodeData).node.type;
    return type === "cloud-rule" || type === "connector-rule" ? label : undefined;
  });

  const layout = $derived.by(() => {
    if (!sourceNode.current || !targetNode.current) {
      return undefined;
    }
    const { sourceX, sourceY, targetX, targetY } = getFloatingEdgeParams(sourceNode.current, targetNode.current);
    const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    return { edgePath, labelX, labelY };
  });
</script>

{#if layout}
  <BaseEdge {id} path={layout.edgePath} label={ruleEdgeLabel} labelX={layout.labelX} labelY={layout.labelY} />
{/if}
