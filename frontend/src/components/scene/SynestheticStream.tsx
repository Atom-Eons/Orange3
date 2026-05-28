import React, { useRef, useState, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useAppStore } from "../../store/useAppStore";
import * as THREE from "three";

interface Token {
  id: string;
  text: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: string;
  createdAt: number;
}

interface SchematicNode {
  id: string;
  position: THREE.Vector3;
  color: string;
  createdAt: number;
}

const COLORS = ["#00f0ff", "#ff00e5", "#b700ff", "#00ff88"];

export function SynestheticStream() {
  const messages = useAppStore((state) => state.messages);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [nodes, setNodes] = useState<SchematicNode[]>([]);
  
  const lastMessageCount = useRef(messages.length);

  // When new chat messages appear in the global store, spawn them as flying tokens
  useEffect(() => {
    if (messages.length > lastMessageCount.current) {
      const newMessages = messages.slice(lastMessageCount.current);
      lastMessageCount.current = messages.length;
      
      const newTokens: Token[] = [];
      newMessages.forEach((msg, mIdx) => {
        const words = msg.content.split(" ").slice(0, 30); // Limit words per message for perf
        words.forEach((word, i) => {
          // Tokens start near the camera (Z=7 to 9) and fly towards the core (Z=0)
          const startZ = 7 + Math.random() * 2 + i * 0.2;
          newTokens.push({
            id: `token-${Date.now()}-${mIdx}-${i}`,
            text: word,
            position: new THREE.Vector3(
              (Math.random() - 0.5) * 8, 
              (Math.random() - 0.5) * 5, 
              startZ
            ),
            // Velocity heading towards the core
            velocity: new THREE.Vector3(
              (Math.random() - 0.5) * 0.2, 
              (Math.random() - 0.5) * 0.2, 
              -3.0 - Math.random() * 2 // Speed of flight
            ),
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            createdAt: Date.now() + i * 50,
          });
        });
      });
      setTokens((prev) => [...prev, ...newTokens]);
    }
  }, [messages]);

  // Animation loop
  useFrame((state, delta) => {
    setTokens((prev) => {
      let changed = false;
      const nextTokens = prev.filter((token) => {
        // If token hits the core plane (Z near 0), morph it into a node!
        if (token.position.z <= 0.5) {
          setNodes((currentNodes) => {
            const newNodes = [...currentNodes, {
              id: `node-${token.id}`,
              position: new THREE.Vector3(
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 2
              ),
              color: token.color,
              createdAt: Date.now()
            }];
            return newNodes.slice(-40); // Keep max 40 nodes to prevent clutter
          });
          changed = true;
          return false; 
        }
        return true;
      });
      
      if (nextTokens.length > 0 || changed) {
        nextTokens.forEach(t => {
          t.position.addScaledVector(t.velocity, delta);
        });
        return nextTokens;
      }
      return prev;
    });

    // Slowly rotate the formed schematic nodes around the core
    setNodes((prev) => {
      if (prev.length === 0) return prev;
      return prev.map((n) => {
        const time = state.clock.getElapsedTime();
        n.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), delta * 0.2);
        return n;
      });
    });
  });

  // Calculate geometry for lines connecting the schematic nodes
  const lineGeometry = useMemo(() => {
    if (nodes.length < 2) return null;
    const points = [];
    for (let i = 1; i < nodes.length; i++) {
      points.push(nodes[i - 1].position.x, nodes[i - 1].position.y, nodes[i - 1].position.z);
      points.push(nodes[i].position.x, nodes[i].position.y, nodes[i].position.z);
    }
    return new Float32Array(points);
  }, [nodes]);

  return (
    <group>
      {/* 1. The Fretboard/Highway Tokens */}
      {tokens.map((token) => (
        <Text
          key={token.id}
          position={token.position}
          color={token.color}
          fontSize={0.15}
          anchorX="center"
          anchorY="middle"
        >
          {token.text}
          <meshBasicMaterial toneMapped={false} color={token.color} transparent opacity={0.8} />
        </Text>
      ))}

      {/* 2. The Process Tree Nodes */}
      {nodes.map((node) => (
        <mesh key={node.id} position={node.position}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshBasicMaterial color={node.color} toneMapped={false} />
          <pointLight color={node.color} intensity={0.4} distance={3} />
        </mesh>
      ))}

      {/* 3. The Process Tree Schematic Lines */}
      {lineGeometry && (
        <lineSegments>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              args={[lineGeometry, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial attach="material" color="#ffffff" transparent opacity={0.15} />
        </lineSegments>
      )}
    </group>
  );
}
