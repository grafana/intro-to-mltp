import { check, sleep } from 'k6';
import http from 'k6/http';

// Test configuration
export const options = {
    vus: 1,
    iterations: 10
};

// Server URL
const url = "http://localhost:4000";

// Available mythical beasts
const beasts = [
    'unicorn',
    'manticore',
    'illithid',
    'owlbear',
    'beholder'
];

// Main test function
export default function () {
    // Pick a random beast for this iteration
    const beast = beasts[Math.floor(Math.random() * beasts.length)];
    const randomName = `TestBeast_${Math.random().toString(36).substring(2, 8)}`;

    // 1. Test POST endpoint - Create a new beast name
    const postResponse = http.post(
        `${url}/${beast}`,
        JSON.stringify({ name: randomName }),
        { headers: { 'Content-Type': 'application/json' } }
    );

    check(postResponse, {
        'POST status is 201': (r) => r.status === 201,
        'POST duration is less than 500ms': (r) => r.timings.duration < 500
    });

    sleep(1);

    // 2. Test GET endpoint - Retrieve all beast names
    const getResponse = http.get(`${url}/${beast}`);

    check(getResponse, {
        'GET status is 200': (r) => r.status === 200,
        'GET duration is less than 500ms': (r) => r.timings.duration < 500,
        'GET response is JSON': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('application/json')
    });

    sleep(1);

    // 3. Test DELETE endpoint - Remove the beast name we created
    const deleteResponse = http.del(
        `${url}/${beast}`,
        JSON.stringify({ name: randomName }),
        { headers: { 'Content-Type': 'application/json' } }
    );

    check(deleteResponse, {
        'DELETE status is 204': (r) => r.status === 204,
        'DELETE duration is less than 500ms': (r) => r.timings.duration < 500
    });

    sleep(1);
} 