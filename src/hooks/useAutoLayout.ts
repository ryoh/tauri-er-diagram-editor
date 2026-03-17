/**
 * useAutoLayout
 *
 * dagre を使って現在のノードを自動配置する。
 *
 * IE モード  : rankdir=TB (上→下), nodesep=60, ranksep=80
 * T字形モード: rankdir=LR (左→右), Resource ノードを先頭 rank に固定,
 *              Event ノードを末尾 rank に固定
 */

import { useCallback } from "react";
import dagre from "@dagrejs/dagre";
import { useReactFlow, type Node } from "@xyflow/react";
import { useDiagramStore } from "../store/useDiagramStore";
import type { TableData } from "../types/diagram";

// Default node dimensions used for layout estimation
const NODE_WIDTH  = 220;
const NODE_HEIGHT = 140;

export function useAutoLayout() {
  const { getNodes, getEdges, fitView } = useReactFlow();
  const { mode, setNodes } = useDiagramStore();

  const runLayout = useCallback(() => {
    const nodes = getNodes() as Node<TableData>[];
    const edges = getEdges();

    if (nodes.length === 0) return;

    const g = new dagre.graphlib.Graph();

    if (mode === "ie") {
      g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });
    } else {
      // T字形モード: LR, Resource=left, Event=right
      g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 100 });
    }

    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes
    for (const node of nodes) {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    // T字形モード: reverse FK direction so Resource ends up on the left
    if (mode === "t-shape") {
      for (const edge of edges) {
        // FK source→target becomes target→source in the layout graph
        g.setEdge(edge.target, edge.source);
      }
      // Pin Resource nodes to rank=0 (source) and Event nodes to the sink
      for (const node of nodes) {
        if (node.data.entityType === "resource") {
          g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT, rank: 0 });
        }
      }
    } else {
      for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
      }
    }

    dagre.layout(g);

    const positioned = nodes.map((node) => {
      const pos = g.node(node.id);
      return {
        ...node,
        position: {
          x: pos.x - NODE_WIDTH  / 2,
          y: pos.y - NODE_HEIGHT / 2,
        },
      };
    });

    setNodes(positioned);

    // Fit the view after layout with a small delay to let React re-render
    setTimeout(() => {
      fitView({ padding: 0.15, duration: 300 });
    }, 50);
  }, [mode, getNodes, getEdges, setNodes, fitView]);

  return { runLayout };
}
