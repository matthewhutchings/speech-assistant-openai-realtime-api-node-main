import fetch from 'node-fetch';

export async function getProfileInfo(phoneNumber) {
    try {
        const response = await fetch('https://ai.fewzen.com/api/locate-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber }),
        });
        return await response.json();
    } catch (error) {
        console.error('Error fetching profile info:', error);
        return null;
    }
}
