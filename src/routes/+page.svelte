<script>
    import { onMount, tick } from 'svelte'

    // State
    let host = ''
    let port = '27015'
    let rconPassword = ''
    let joinPassword = ''

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
    let newMapLink = ''
    let selectedStandardMap = STANDARD_MAPS[0]

    // Commands
    const COMMAND_GROUPS = [
        {
            name: 'Game Control',
            commands: [
                { type: 'action', label: 'Restart Game', cmd: 'mp_restartgame 1' },
                { type: 'action', label: 'Scramble Teams', cmd: 'mp_scrambleteams' },
                { type: 'action', label: 'Swap Teams', cmd: 'mp_swapteams' },
                {
                    type: 'toggle',
                    label: 'Match Pause',
                    cmdOn: 'mp_pause_match',
                    cmdOff: 'mp_unpause_match',
                    state: false,
                },
            ],
        },
        {
            name: 'Warmup',
            commands: [
                { type: 'action', label: 'Start Warmup', cmd: 'mp_warmup_start' },
                { type: 'action', label: 'End Warmup', cmd: 'mp_warmup_end' },
                {
                    type: 'toggle',
                    label: 'Warmup Pause',
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
        {
            name: 'Fun',
            commands: [
                {
                    type: 'toggle',
                    label: 'Cheats *',
                    cmdOn: 'sv_cheats 1',
                    cmdOff: 'sv_cheats 0',
                    state: false,
                },
                {
                    type: 'toggle',
                    label: 'Headshot Only',
                    cmdOn: 'mp_damage_headshot_only true',
                    cmdOff: 'mp_damage_headshot_only false',
                    state: false,
                },
                {
                    type: 'toggle',
                    label: 'Low Gravity',
                    cmdOn: 'sv_gravity 100',
                    cmdOff: 'sv_gravity 800',
                    state: false,
                },
                {
                    type: 'toggle',
                    label: 'NoSpread',
                    cmdOn: 'weapon_accuracy_nospread true',
                    cmdOff: 'weapon_accuracy_nospread false',
                    state: false,
                },
                {
                    type: 'toggle',
                    label: 'Buy Anywhere',
                    cmdOn: 'mp_buy_anywhere 1',
                    cmdOff: 'mp_buy_anywhere 0',
                    state: false,
                },
                {
                    type: 'toggle',
                    label: 'Infinite Ammo *',
                    cmdOn: 'sv_cheats 1;sv_infinite_ammo 1;',
                    cmdOff: 'sv_infinite_ammo 0;sv_cheats 0;',
                    state: false,
                },
                {
                    type: 'toggle',
                    label: 'Drop Knife',
                    cmdOn: 'mp_drop_knife_enable true',
                    cmdOff: 'mp_drop_knife_enable false',
                    state: false,
                },
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
            rconPassword = config.rconPassword || ''
            joinPassword = config.joinPassword || ''

            refreshPlayers()
        }

        const savedMaps = localStorage.getItem('xrecon_ws_maps')
        if (savedMaps) {
            workshopMaps = JSON.parse(savedMaps)
        }
    })

    /* Actions */
    async function saveConfig() {
        // if host is domain -> resolve, if ip continue
        if (host && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
            try {
                const res = await fetch('/api/dns', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain: host }),
                })

                const data = await res.json()
                if (data.error) {
                    addToConsole('error', data.error)
                    return
                }

                host = data.records[0] || host
            } catch (e) {
                addToConsole('error', 'DNS resolution failed')
                return
            }
        }

        localStorage.setItem('xrecon_config', JSON.stringify({ host, port, rconPassword, joinPassword }))
        addToConsole('System', 'Config saved to localStorage.')
    }

    function joinServer() {
        if (!host || !port || !joinPassword) {
            addToConsole('error', 'Missing server configuration.')
            return
        }

        window.location.href = `steam://connect/${host}:${port}/${joinPassword}`
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
        if (!host || !port || !rconPassword) {
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
                body: JSON.stringify({ host, port, password: rconPassword, command: finalCmd }),
            })

            const data = await res.json()

            if (data.error) {
                addToConsole('error', data.error)
            } else {
                addToConsole('out', data.output)
                console.log('API Response', data.output)
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
        if (newMapName.trim() && newMapLink.trim()) {
            const url = new URL(newMapLink.trim())
            const id = url.searchParams.get('id')
            if (id) {
                workshopMaps = [...workshopMaps, { name: newMapName.trim(), id }]
                localStorage.setItem('xrecon_ws_maps', JSON.stringify(workshopMaps))
                newMapName = ''
                newMapLink = ''
            }
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
                required
            />
        </div>
        <div class="toolbar-group">
            <span class="label">PORT</span>
            <input
                type="text"
                bind:value={port}
                placeholder="27015"
                style="width: 80px;"
                required
            />
        </div>
        <div class="toolbar-group">
            <span class="label">RCON</span>
            <input
                type="password"
                bind:value={rconPassword}
                placeholder="******"
                style="width: 120px;"
                required
            />
        </div>
        <div class="toolbar-group">
            <span class="label">PASSWORD</span>
            <input
                type="password"
                bind:value={joinPassword}
                placeholder="******"
                style="width: 120px;"
            />
        </div>
        <button on:click={saveConfig}>Save</button>
        <button
            on:click={joinServer}
            disabled={!host || !port || !joinPassword}
            style="background-color: {!host || !port || !joinPassword
                ? 'grey'
                : 'hsl(from var(--accent) h s l)'}; color: {!host || !port || !joinPassword
                ? 'darkgrey'
                : 'hsl(from var(--accent-foreground) h s l)'};">Join</button
        >
        <div style="flex:1"></div>
        <span style="font-weight:bold; color: hsl(from var(--accent) h s l);">xReCON</span>
    </header>

    <!-- Left: Controls -->
    <aside class="sidebar left">
        <div class="section-title">Controls</div>
        <div class="controls flex-col gap-2">
            {#each COMMAND_GROUPS as group}
                <div
                    class="label"
                    style="font-size: 0.75rem; margin-top: 0.5rem;"
                >
                    {group.name}
                </div>
                <div
                    class="flex-col gap-2"
                    style="padding-left: 0.5rem; border-left: 2px solid hsl(from var(--accent) h s l);"
                >
                    {#each group.commands as cmd}
                        {#if cmd.type === 'toggle'}
                            <div
                                class="flex-row"
                                style="justify-content: space-between; align-items: center;"
                            >
                                <span style="padding: 0.5rem; font-size: 0.875rem;">{cmd.label}</span>
                                <div
                                    style="height: 1px; flex: 1; border-bottom: 1px solid hsl(from var(--border) h s l);"
                                ></div>
                                <div
                                    class="flex-row gap-2"
                                    style="padding-left: 0.5rem;"
                                >
                                    <button
                                        class="outline"
                                        on:click={() => sendCommand(cmd.cmdOn)}
                                    >
                                        On
                                    </button>
                                    <button
                                        class="outline"
                                        on:click={() => sendCommand(cmd.cmdOff)}
                                    >
                                        Off
                                    </button>
                                </div>
                            </div>
                        {:else}
                            <button
                                class="outline"
                                on:click={() => sendCommand(cmd)}
                            >
                                {cmd.label}
                            </button>
                        {/if}
                    {/each}
                </div>
            {/each}
        </div>
    </aside>

    <!-- Middle: Console -->
    <main class="content">
        <div class="section-title">Console</div>
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
                    disabled={isProcessing}
                    style="background-color: hsl(from var(--accent) h s l); color:hsl(from var(--accent-foreground) h s l)"
                    >Send</button
                >
            </div>
        </div>
    </main>

    <!-- Right: Maps -->
    <aside class="sidebar right">
        <div class="section-title">Maps</div>
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
            style="overflow-y: scroll; flex:1; max-height: auto;"
        >
            {#each workshopMaps as map}
                <div style="display:flex; gap:0.2rem; align-items:center;">
                    <button
                        class="outline"
                        style="flex:1; text-align:left; overflow:hidden; text-overflow:ellipsis;"
                        on:click={() => changeWorkshopMap(map.id)}
                        title={`ID: ${map.id}`}
                    >
                        {map.name}
                        <span style="font-size:0.5rem; opacity:0.5;">{map.id}</span>
                    </button>
                    <a
                        class="button outline"
                        href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${map.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style="margin: 0 .25rem;"
                    >
                        Page
                    </a>
                    <button
                        class="destructive"
                        style="padding: 0.5rem; height: 2.25rem; width: 2.25rem;"
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
            <div
                class="label"
                style="font-size:0.75rem;"
            >
                Add Workshop Map:
            </div>
            <div
                class="flex-row gap-2"
                style="font-size:0.8rem; align-items:center;"
            >
                <input
                    type="text"
                    bind:value={newMapName}
                    placeholder="Map Name"
                    style="font-size:0.8rem;"
                />
                <input
                    type="text"
                    bind:value={newMapLink}
                    placeholder="Map Link"
                    style="font-size:0.8rem;"
                />
            </div>
            <button
                on:click={addWorkshopMap}
                style="font-size:0.8rem;">Add Workshop Map</button
            >
        </div>
    </aside>

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
