import { json } from '@sveltejs/kit'
import { Rcon } from 'rcon-client'

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
    const { host, port, password, command } = await request.json()

    if (!host || !port || !password || !command) {
        return json({ error: 'Missing required fields' }, { status: 400 })
    }

    try {
        const rcon = new Rcon({
            host,
            port: parseInt(port),
            password,
            timeout: 5000,
        })

        await rcon.connect()
        const response = await rcon.send(command)
        await rcon.end()

        return json({ output: response })
    } catch (error) {
        console.error('RCON Error:', error)
        return json({ error: error.message || 'Failed to execute command' }, { status: 500 })
    }
}
