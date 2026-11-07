const BASE_URL = "https://www.omdbapi.com/";

async function request(params, signal) {
    const url = new URL(BASE_URL);

    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    const response = await fetch(url, { signal });

    if (!response.ok) {
        throw new Error(`Ошибка сети: ${response.status}`);
    }

    return response.json();
}

// Поиск по названию: возвращает { Search, totalResults, Response, Error }
export function searchMovies({ query, page = 1, apiKey, signal }) {
    return request({ s: query, page, apikey: apiKey }, signal);
}

// Детали фильма: нужны ради описания (Plot), которого нет в поиске
export function fetchMovieDetails({ id, apiKey, signal }) {
    return request({ i: id, plot: "short", apikey: apiKey }, signal);
}
