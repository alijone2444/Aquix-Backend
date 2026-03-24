const axios = require('axios');

/**
 * POST /api/ai/analyze
 * Body: { company: string, tier: 1 | 2 | 3 }
 * Returns the AI analysis JSON produced by local Python API
 */
const analyzeCompany = async (req, res) => {
    const { company, tier } = req.body;

    if (!company || !tier) {
        return res.status(400).json({ error: 'Missing required fields: company, tier' });
    }

    const tierInt = parseInt(tier, 10);
    if (![1, 2, 3].includes(tierInt)) {
        return res.status(400).json({ error: 'tier must be 1, 2, or 3' });
    }

    try {
        const response = await axios.post('http://localhost:8000/audit', {
            company_name: company,
            tier: tierInt
        });
        
        const data = response.data;
        const resultPayload = {
            tier: data.tier,
            company_name: data.company_name,
            ...(data.scores || {})
        };
        
        return res.status(200).json(resultPayload);
    } catch (err) {
        console.error('[AI] Request to AI service failed:', err.message);
        if (err.response) {
            return res.status(err.response.status).json({
                error: 'AI service error',
                details: err.response.data
            });
        }
        return res.status(500).json({ error: 'Failed to contact AI service', details: err.message });
    }
};

module.exports = { analyzeCompany };
