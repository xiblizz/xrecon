import { json } from '@sveltejs/kit';
import dns from 'node:dns/promises';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
    try {
        const body = await request.json();
        const { domain } = body;

        if (!domain) {
            return json({ error: 'Domain is required' }, { status: 400 });
        }

        // Perform the DNS lookup (IPv4 - A records)
        // addresses will be an array of IP strings (e.g. ['192.168.1.1'])
        const addresses = await dns.resolve4(domain);

        return json({
            domain,
            records: addresses,
            type: 'A'
        });

    } catch (error) {
        console.error('DNS Lookup failed:', error);

        // Handle specific DNS errors (e.g., domain not found)
        if (error.code === 'ENOTFOUND' || error.code === 'ESERVFAIL') {
            return json({ error: 'Domain not found or DNS error' }, { status: 404 });
        }

        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
}