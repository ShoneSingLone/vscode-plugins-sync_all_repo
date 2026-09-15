(() => {
	const vscode = acquireVsCodeApi();
	const repoListEl = document.getElementById("repoList");
	const emptyStateEl = document.getElementById("emptyState");
	const searchInputEl = document.getElementById("searchInput");
	const btnRefresh = document.getElementById("btnRefresh");
	const btnPullAll = document.getElementById("btnPullAll");
	const btnSyncAll = document.getElementById("btnSyncAll");

	if (btnRefresh) {
		btnRefresh.onclick = () => vscode.postMessage({ type: "refresh" });
	}
	if (btnPullAll) {
		btnPullAll.onclick = () => vscode.postMessage({ type: "pullAll" });
	}
	if (btnSyncAll) {
		btnSyncAll.onclick = () => vscode.postMessage({ type: "syncAll" });
	}

	if (searchInputEl) {
		searchInputEl.oninput = () => {
			renderFiltered();
		};
	}

	let allRepos = [];

	function getStatusClass(repo) {
		if (repo.conflicts > 0) return "status-conflict";
		if (repo.dirty > 0) return "status-dirty";
		return "status-clean";
	}

	function formatAheadBehind(remote) {
		const ahead = remote.ahead < 0 ? "?" : String(remote.ahead);
		const behind = remote.behind < 0 ? "?" : String(remote.behind);
		const label = `${remote.name} ↑${ahead} ↓${behind}`;
		const cls = remote.behind > 0 ? "remote-badge has-behind" : "remote-badge";
		return `<span class="${cls}" title="${remote.url}">${label}</span>`;
	}

	function renderRepoList(repos) {
		if (!repoListEl) return;
		if (!repos || repos.length === 0) {
			repoListEl.innerHTML = "";
			if (emptyStateEl) emptyStateEl.style.display = "block";
			return;
		}
		if (emptyStateEl) emptyStateEl.style.display = "none";
		const html = repos.map(repo => {
			const statusCls = getStatusClass(repo);
			const remoteBadges = repo.remotes.map(formatAheadBehind).join("");
			const dirtyCls = repo.dirty > 0 ? "dirty-count has-dirty" : "dirty-count";
			return `
<div class="repo-card">
  <div class="repo-header">
    <span class="status-dot ${statusCls}"></span>
    <span class="repo-name">${esc(repo.name)}</span>
    <span class="repo-branch">${esc(repo.branch)}</span>
    <div class="remote-badges">${remoteBadges}</div>
    <span class="${dirtyCls}">脏${repo.dirty}</span>
  </div>
  <div class="repo-actions">
    <button data-action="sync" data-repo="${esc(repo.id)}" class="primary">🔃 同步</button>
    <button data-action="pull" data-repo="${esc(repo.id)}">⬇ 拉取</button>
    <button data-action="status" data-repo="${esc(repo.id)}">📋 状态</button>
    <button data-action="terminal" data-repo="${esc(repo.id)}">⬛ 终端</button>
    <button data-action="explorer" data-repo="${esc(repo.id)}">📂 资源管理器</button>
  </div>
</div>`;
		}).join("");
		repoListEl.innerHTML = html;
	}

	function renderFiltered() {
		const query = searchInputEl ? searchInputEl.value.trim().toLowerCase() : "";
		if (!query) {
			renderRepoList(allRepos);
			return;
		}
		const filtered = allRepos.filter(r => r.name.toLowerCase().includes(query));
		renderRepoList(filtered);
	}

	function esc(s) {
		const el = document.createElement("span");
		el.textContent = s || "";
		return el.innerHTML;
	}

	if (repoListEl) {
		repoListEl.addEventListener("click", e => {
			const target = e.target;
			if (!target || !target.dataset) return;
			const action = target.dataset.action;
			const repoId = target.dataset.repo;
			if (!action || !repoId) return;
			const actionMap = {
				sync: "sync",
				pull: "pull",
				status: "status",
				terminal: "openTerminal",
				explorer: "revealInExplorer"
			};
			const msgType = actionMap[action];
			if (msgType) {
				vscode.postMessage({ type: msgType, payload: { repoId } });
			}
		});
	}

	window.addEventListener("message", event => {
		const msg = event.data;
		if (msg && msg.type === "update") {
			allRepos = msg.payload || [];
			renderFiltered();
		}
	});

	vscode.postMessage({ type: "ready" });
})();
