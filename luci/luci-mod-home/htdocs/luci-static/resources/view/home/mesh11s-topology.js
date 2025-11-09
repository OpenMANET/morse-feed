/* 802.11s mesh topology viewer.
 *
 * Copyright 2024 Morse Micro
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

/* globals baseclass rpc Viva */
'require baseclass';
'require rpc';

const callLuciGetHostHints = rpc.declare({
	object: 'luci-rpc',
	method: 'getHostHints',
	expect: { '': {} },
});

const callMesh11sTopology = rpc.declare({
	object: 'mesh11s',
	method: 'get_topology',
	params: [],
});

const PRERENDER_ITERATIONS = 1000;

function getHostInfoFromMac(dhcpInfo, macAddress) {
	if (!macAddress) return null;

	const entry = dhcpInfo[macAddress.toUpperCase()];
	if (!entry) return null;

	return {
		hostname: entry.name || 'unknown',
		ipv4: entry.ipaddrs?.[0],
		ipv6: entry.ip6addrs?.[0],
	};
}

class Mesh11sTopologyGraph {
	constructor(topoData, dhcpInfo, interactive = true, nodeWidth = 240, nodeHeight = 100) {
		this.interactive = interactive;
		this.nodeHeight = nodeHeight;
		this.nodeWidth = nodeWidth;
		this.stateInfo = this.buildGraph(topoData, dhcpInfo);
	}

	getStateInfo() {
		return this.stateInfo;
	}

	buildGraph(data, dhcpInfo) {
		const graph = this.graph = Viva.Graph.graph();
		const stateInfo = new Set();
		const { nodeinfo, neighbors = [], paths = [] } = data;

		const currentMac = nodeinfo.macaddress;
		if (!currentMac) return stateInfo;

		const addedNodes = new Set();

		const addNode = (mac, extraData = {}) => {
			if (!mac || addedNodes.has(mac)) return;

			const { hostname, ipv4, ipv6 } = getHostInfoFromMac(dhcpInfo, mac) || {};
			graph.addNode(mac, {
				hostname,
				macAddress: mac,
				ipv4Address: ipv4,
				ipv6Address: ipv6,
				...extraData,
			});
			stateInfo.add(`node:${mac}:true`);
			addedNodes.add(mac);
		};

		// Add current node
		addNode(currentMac, { current: true, enabled: true });

		// Add neighbors and links to current node
		if (!neighbors) return stateInfo;
		for (const neighbor of neighbors) {
			const mac = neighbor.mac;
			addNode(mac, { current: false, enabled: true });

			if (!graph.hasLink(currentMac, mac)) {
				graph.addLink(currentMac, mac, { signalStrength: neighbor.signal });
			}
		}

		// Add paths and links between destination → next_hop
		if (!paths) return stateInfo;
		for (const path of paths) {
			const from = path.destination;
			const to = path.next_hop;
			const hop_count = path.hop_count;

			addNode(from, { current: false });
			addNode(to, { current: false });

			if (!graph.hasLink(from, to)) {
				graph.addLink(from, to, { hopCount: hop_count });
			}
		}

		return stateInfo;
	}

	renderNode(data) {
		return `
			<div
				class="node ${data.current ? 'node-controller' : 'node-agent'} ${data.enabled ? '' : 'node-disabled'}"
				style="
					width: ${this.nodeWidth - 8}px;
					height: ${this.nodeHeight - 8}px;
				"
				xmlns="http://www.w3.org/1999/xhtml"
				title="${data.enabled ? 'active' : 'offline'}"
			>
				<div>
				${data.hostname ? `<strong>Hostname: <code>${data.hostname}</code></strong><br>` : ''}
				<strong>MAC: ${data.macAddress}</strong><br>
				${data.ipv4Address ? `<strong>IP: ${data.ipv4Address}` : ''}
				${data.ipv6Address ? `<strong> /[${data.ipv6Address}]</strong>` : ''}
				</div>
			</div>
		`;
	}

	renderTo(container) {
		const graphics = Viva.Graph.View.svgGraphics().node((node) => {
			const foreignObject = Viva.Graph.svg('foreignObject').attr('width', this.nodeWidth).attr('height', this.nodeHeight);
			// If we somehow accidentally add a link and the node isn't populated, the node will have no data.
			// This shouldn't happen, but to avoid potential crashes...
			foreignObject.insertAdjacentHTML('beforeend', this.renderNode(node.data || { enabled: false, macAddress: 'unknown' }));
			return foreignObject;
		})
			.placeNode((nodeUI, pos) => {
			// Shift so that boxes are centered.
				nodeUI.attr('x', pos.x - this.nodeWidth / 2).attr('y', pos.y - this.nodeHeight / 2);
			})
			.link((link) => {
				const titleLine = Viva.Graph.svg('line').attr('stroke-width', 20).attr('stroke', 'black').attr('stroke-opacity', 0);
				const title = Viva.Graph.svg('title');
				const rssi = link.data?.signalStrength;
				const hops = link.data?.hopCount;
				let text = [];
				if (rssi !== undefined) {
					text.push(`RSSI: ${rssi}dBm`);
				}
				if (hops !== undefined) {
					text.push(`Hops: ${hops}`);
				}
				title.textContent = text.join(', ');
				titleLine.append(title);
				const g = Viva.Graph.svg('g');
				g.append(Viva.Graph.svg('line').attr('stroke', 'black').attr('stroke-width', 2));
				g.append(titleLine);
				return g;
			})
			.placeLink((link, from, to) => {
				for (const line of link.querySelectorAll('line')) {
					line.attr('x1', from.x);
					line.attr('y1', from.y);
					line.attr('x2', to.x);
					line.attr('y2', to.y);
				}
				return link;
			});

		const layout = Viva.Graph.Layout.forceDirected(this.graph, {
			springLength: Math.max(this.nodeHeight, this.nodeWidth) * 1.2,
			gravity: -3, // Need to increase gravity as nodes are large.
		});

		// specify where it should be rendered:
		const renderer = Viva.Graph.View.renderer(this.graph, {
			graphics,
			layout,
			container,
			interactive: this.interactive, // whether the user can move nodes around
			prerender: PRERENDER_ITERATIONS, // Avoids jumpiness at start
		});

		renderer.run();

		// Hack: Render needs to reset after the div has been inserted in the DOM
		// as the VivaGraph code calculates offsets based on the current container.
		setTimeout(() => renderer.reset(), 0);

		return renderer;
	}
}

class Mesh11sTopologyData {
	constructor(rawData, dhcpInfo) {
		this.rawData = rawData;
		this.dhcpInfo = dhcpInfo;
	}

	buildGraph() {
		return new Mesh11sTopologyGraph(this.rawData, this.dhcpInfo);
	}

	countAgents() {
		return this.rawData?.nodeinfo?.mesh_peer_count || 0;
	}

	meshStatus() {
		return !!this.rawData?.nodeinfo;
	}
}

return baseclass.extend({
	async load() {
		const [topoData, dhcpInfo, _] = await Promise.all([
			callMesh11sTopology(),
			callLuciGetHostHints(),
			import('/luci-static/resources/vivagraph.min.js'),
		]);
		return new Mesh11sTopologyData(topoData, dhcpInfo);
	},
});
