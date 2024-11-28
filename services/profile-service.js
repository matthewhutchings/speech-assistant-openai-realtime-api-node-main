import fetch from 'node-fetch';

export async function getProfileInfo(phoneNumber, twilioNumber) {
    try {
        console.log(`Fetching profile info for phoneNumber: ${phoneNumber}, twilioNumber: ${twilioNumber}`);

        const response = await fetch('https://ai.fewzen.com/api/locate-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber, twilioNumber }),
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.error('Unexpected content type:', contentType);
            throw new Error(`Unexpected content type: ${contentType}`);
        }

        const data = await response.json();
        console.log('Profile info fetched:', data);
        return data;
    } catch (error) {
        console.error('Error fetching profile info:', error);
        return null; // Gracefully handle errors
    }
}
