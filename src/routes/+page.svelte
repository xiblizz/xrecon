<script>
    import { onMount, tick } from 'svelte'

    // State
    let host = ''
    let port = '27015'
    let password = ''

    let consoleHistory = []
    let commandInput = ''
    let isProcessing = false

    let players = []

    // Maps
    const STANDARD_MAPS = [
        'de_ancient',
        'de_anubis',
        'de_dust2',
        'de_inferno',
        'de_mirage',
        'de_nuke',
        'de_overpass',
        'de_vertigo',
        'cs_office',
        'cs_italy',
    ]
    let workshopMaps = [] // Array of { name, id }
    let newMapName = ''
    let newMapId = ''
    let selectedStandardMap = STANDARD_MAPS[0]

    // Commands
    const COMMAND_GROUPS = [
        {
            name: 'Game Control',
            commands: [
                { type: 'action', label: 'Restart Game', cmd: 'mp_restartgame 1' },
                { type: 'action', label: 'Match Pause', cmd: 'mp_pause_match' },
                { type: 'action', label: 'Match Unpause', cmd: 'mp_unpause_match' },
            ],
        },
        {
            name: 'Warmup',
            commands: [
                { type: 'action', label: 'Start Warmup', cmd: 'mp_warmup_start' },
                { type: 'action', label: 'End Warmup', cmd: 'mp_warmup_end' },
                {
                    type: 'toggle',
                    label: 'Toggle Warmup Timer',
                    cmdOn: 'mp_warmup_pausetimer 1',
                    cmdOff: 'mp_warmup_pausetimer 0',
                    state: false,
                },
            ],
        },
        {
            name: 'Bots',
            commands: [
                { type: 'action', label: 'Kick Bots', cmd: 'bot_kick' },
                { type: 'action', label: 'Add Bot (CT)', cmd: 'bot_add_ct' },
                { type: 'action', label: 'Add Bot (T)', cmd: 'bot_add_t' },
            ],
        },
    ]

    /* Lifecycle */
    onMount(() => {
        const savedConfig = localStorage.getItem('xrecon_config')
        if (savedConfig) {
            const config = JSON.parse(savedConfig)
            host = config.host || ''
            port = config.port || '27015'
            password = config.password || ''

            refreshPlayers()
        }

        const savedMaps = localStorage.getItem('xrecon_ws_maps')
        if (savedMaps) {
            workshopMaps = JSON.parse(savedMaps)
        }
    })

    /* Actions */
    function saveConfig() {
        localStorage.setItem('xrecon_config', JSON.stringify({ host, port, password }))
        addToConsole('System', 'Config saved to localStorage.')
    }

    function addToConsole(type, text) {
        consoleHistory = [...consoleHistory, { type, text, time: new Date().toLocaleTimeString() }]
        // Scroll to bottom
        tick().then(() => {
            const el = document.getElementById('console-end')
            el?.scrollIntoView({ behavior: 'smooth' })
        })
    }

    async function sendCommand(cmd) {
        if (!host || !port || !password) {
            addToConsole('error', 'Missing server configuration.')
            return
        }

        // Handle string commands directly
        let finalCmd = cmd

        // Handle command objects (for toggles)
        if (typeof cmd === 'object') {
            if (cmd.type === 'toggle') {
                // Determine which command to send based on CURRENT state (before toggle)
                // If it was false (off), we want to turn it ON (so use cmdOn)
                // If it was true (on), we want to turn it OFF (so use cmdOff)
                finalCmd = !cmd.state ? cmd.cmdOn : cmd.cmdOff

                // Toggle the state visually
                cmd.state = !cmd.state
            } else {
                finalCmd = cmd.cmd
            }
        }

        addToConsole('in', finalCmd)
        isProcessing = true

        try {
            const res = await fetch('/api/rcon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host, port, password, command: finalCmd }),
            })

            const data = await res.json()

            if (data.error) {
                addToConsole('error', data.error)
            } else {
                addToConsole('out', data.output)
                // If cmd was status, parse it
                if (finalCmd.trim() === 'status_json') {
                    parseStatus(data.output)
                }
            }
        } catch (e) {
            addToConsole('error', 'Network/Server Error')
        } finally {
            isProcessing = false
        }
    }

    function handleConsoleSubmit() {
        if (!commandInput.trim()) return
        sendCommand(commandInput)
        commandInput = ''
    }

    function handleKeydown(e) {
        if (e.key === 'Enter') handleConsoleSubmit()
    }

    /* Map Management */
    function addWorkshopMap() {
        if (newMapName.trim() && newMapId.trim()) {
            workshopMaps = [...workshopMaps, { name: newMapName.trim(), id: newMapId.trim() }]
            localStorage.setItem('xrecon_ws_maps', JSON.stringify(workshopMaps))
            newMapName = ''
            newMapId = ''
        }
    }

    function removeWorkshopMap(id) {
        workshopMaps = workshopMaps.filter((m) => m.id !== id)
        localStorage.setItem('xrecon_ws_maps', JSON.stringify(workshopMaps))
    }

    function changeMap(mapName) {
        sendCommand(`changelevel ${mapName}`)
    }

    function changeWorkshopMap(id) {
        sendCommand(`host_workshop_map ${id}`)
    }

    /* Player Management */
    function refreshPlayers() {
        sendCommand(`status_json`)
    }

    function parseStatus(output) {
        try {
            // status_json returns a JSON string, but sometimes might have garbage around it
            // Let's try to find the start and end of the JSON object
            const start = output.indexOf('{')
            const end = output.lastIndexOf('}')
            if (start !== -1 && end !== -1) {
                const jsonStr = output.substring(start, end + 1)
                const data = JSON.parse(jsonStr)

                if (data && data.server && data.server.clients) {
                    players = data.server.clients.map((client, index) => ({
                        userid: index, // status_json doesn't give userid
                        name: client.name,
                        steamid: client.steamid,
                        bot: client.bot,
                        // Use name for kicking since we don't have userid
                        kickTarget: client.name,
                    }))
                    return
                }
            }
        } catch (e) {
            console.error('Failed to parse status_json', e)
        }

        // Fallback or just log
        console.log('Fallback parsing for status output... failed or invalid json')
    }

    function kickPlayer(kickTarget) {
        if (confirm(`Kick ${kickTarget}?`)) {
            // Enclose name in quotes to handle spaces
            sendCommand(`kick "${kickTarget}"`)
            setTimeout(refreshPlayers, 1000)
        }
    }
</script>

<div class="layout">
    <!-- Top: Header / Toolbar -->
    <header class="header">
        <div class="toolbar-group">
            <span class="label">HOST</span>
            <input
                type="text"
                bind:value={host}
                placeholder="127.0.0.1"
                style="width: 150px;"
            />
        </div>
        <div class="toolbar-group">
            <span class="label">PORT</span>
            <input
                type="text"
                bind:value={port}
                placeholder="27015"
                style="width: 80px;"
            />
        </div>
        <div class="toolbar-group">
            <span class="label">RCON</span>
            <input
                type="password"
                bind:value={password}
                placeholder="******"
                style="width: 120px;"
            />
        </div>
        <button on:click={saveConfig}>Save</button>
        <div style="flex:1"></div>
        <span style="font-weight:bold; color: hsl(var(--primary));">xReCON</span>
    </header>

    <!-- Left: Control Panel -->
    <aside class="sidebar">
        <div class="section-title">Controls</div>
        <div class="flex-col gap-2">
            {#each COMMAND_GROUPS as group}
                <div
                    class="label"
                    style="font-size: 0.75rem; margin-top: 0.5rem;"
                >
                    {group.name}
                </div>
                <div
                    class="flex-col gap-2"
                    style="padding-left: 0.5rem; border-left: 2px solid hsl(from var(--border) h s l);"
                >
                    {#each group.commands as cmd}
                        <button
                            class={cmd.type === 'toggle' && cmd.state ? 'secondary' : 'outline'}
                            on:click={() => sendCommand(cmd)}
                        >
                            {cmd.label}
                        </button>
                    {/each}
                </div>
            {/each}
        </div>

        <div
            class="section-title"
            style="margin-top: 1rem;"
        >
            Maps
        </div>

        <!-- Standard Maps -->
        <div
            class="flex-col gap-2"
            style="margin-bottom: 0.5rem; padding-bottom: 0.5rem;"
        >
            <div
                class="label"
                style="font-size:0.75rem;"
            >
                Standard Maps
            </div>
            <div style="display:flex; gap:0.5rem;">
                <select
                    bind:value={selectedStandardMap}
                    style="flex:1; background:transparent; color:inherit; border:1px solid hsl(from var(--border) h s l); border-radius: var(--radius); padding: 0.25rem;"
                >
                    {#each STANDARD_MAPS as map}
                        <option value={map}>{map}</option>
                    {/each}
                </select>
                <button
                    class="outline"
                    on:click={() => changeMap(selectedStandardMap)}>Go</button
                >
            </div>
        </div>

        <!-- Workshop Maps -->
        <div
            class="label"
            style="font-size:0.75rem;"
        >
            Workshop Maps
        </div>
        <div
            class="flex-col gap-2"
            style="overflow-y:auto; flex:1; max-height: auto;"
        >
            {#each workshopMaps as map}
                <div style="display:flex; gap:0.2rem;">
                    <button
                        class="outline"
                        style="flex:1; text-align:left; overflow:hidden; text-overflow:ellipsis;"
                        on:click={() => changeWorkshopMap(map.id)}
                        title={`ID: ${map.id}`}
                    >
                        {map.name}
                    </button>
                    <button
                        class="destructive"
                        style="padding: 0.5rem;"
                        on:click={() => removeWorkshopMap(map.id)}>x</button
                    >
                </div>
            {/each}
            {#if workshopMaps.length === 0}
                <div style="font-style:italic; opacity:0.5; font-size:0.8rem;">No Workshop Maps saved</div>
            {/if}
        </div>

        <div
            class="flex-col gap-2"
            style="margin-top:0.5rem; padding-top: 0.5rem;"
        >
            <input
                type="text"
                bind:value={newMapName}
                placeholder="Map Name"
                style="font-size:0.8rem;"
            />
            <input
                type="text"
                bind:value={newMapId}
                placeholder="Map ID"
                style="font-size:0.8rem;"
            />
            <button
                on:click={addWorkshopMap}
                style="font-size:0.8rem;">Add Workshop Map</button
            >
        </div>
    </aside>

    <!-- Right: Console -->
    <main class="content">
        <div class="console">
            <div class="console-output">
                {#each consoleHistory as log}
                    <div
                        style="color: {log.type === 'in'
                            ? '#ffff00'
                            : log.type === 'error'
                              ? '#ff4444'
                              : log.type === 'System'
                                ? '#44ff44'
                                : '#efefef'};"
                    >
                        <span style="opacity:0.5; margin-right:0.5rem;">[{log.time}]</span>
                        {#if log.type === 'in'}&gt;
                        {/if}
                        {log.text}
                    </div>
                {/each}
                <div id="console-end"></div>
            </div>
            <div class="console-input">
                <input
                    type="text"
                    bind:value={commandInput}
                    on:keydown={handleKeydown}
                    placeholder="Enter command..."
                    disabled={isProcessing}
                />
                <button
                    on:click={handleConsoleSubmit}
                    disabled={isProcessing}>Send</button
                >
            </div>
        </div>
    </main>

    <!-- Bottom: Player List -->
    <footer class="footer">
        <div class="section-title flex-row gap-2">
            Players ({players.length})<button
                class="outline"
                on:click={refreshPlayers}>Refresh</button
            >
        </div>
        <div class="player-list">
            {#each players as player}
                <div class="player-card">
                    <div>
                        <div style="font-weight:bold;">{player.name}</div>
                        <div style="font-size:0.75rem; opacity:0.7;">{player.steamid || ''}</div>
                    </div>
                    <button
                        class="destructive"
                        on:click={() => kickPlayer(player.kickTarget)}>Kick</button
                    >
                </div>
            {/each}
            {#if players.length === 0}
                <div style="color: hsl(var(--muted-foreground)); font-style: italic;">
                    No players found. (Try refreshing?)
                </div>
            {/if}
        </div>
    </footer>
</div>
