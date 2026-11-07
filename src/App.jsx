import { useEffect, useRef, useState } from "react";
import { fetchMovieDetails, searchMovies } from "./api/omdb";
import { MovieCard } from "./components/MovieCard";
import "./App.css";

const API_KEY_STORAGE = "omdb_api_key";
const HISTORY_STORAGE = "omdb_history";

function readStorage(key) {
    try {
        return localStorage.getItem(key) || "";
    } catch {
        return "";
    }
}

function readHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_STORAGE);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function translateApiError(message = "") {
    if (/invalid api key/i.test(message)) {
        return "Неверный API-ключ OMDb. Проверьте ключ и попробуйте снова.";
    }
    if (/request limit/i.test(message)) {
        return "Превышен дневной лимит запросов OMDb. Попробуйте завтра.";
    }
    if (/not found/i.test(message)) {
        return "Ничего не найдено";
    }
    return message || "Неизвестная ошибка OMDb";
}

const EXAMPLES = ["Matrix", "Inception", "Interstellar"];

function App() {
    // --- Ключ API ---
    const [apiKey, setApiKey] = useState(
        () => import.meta.env.VITE_OMDB_API_KEY || readStorage(API_KEY_STORAGE),
    );
    const [keyDraft, setKeyDraft] = useState("");
    const [keyPanelOpen, setKeyPanelOpen] = useState(false);

    // --- Состояния поиска ---
    const [query, setQuery] = useState("");
    const [lastQuery, setLastQuery] = useState("");
    const [movies, setMovies] = useState([]);
    const [status, setStatus] = useState("idle"); // idle | loading | error | empty | success
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    const [totalResults, setTotalResults] = useState(0);

    // --- Дополнительно: фильтр по году и история ---
    const [yearFrom, setYearFrom] = useState("");
    const [yearTo, setYearTo] = useState("");
    const [history, setHistory] = useState(readHistory);

    // Описания фильмов (Plot) подгружаются отдельными запросами
    const [plots, setPlots] = useState({});
    const plotsRef = useRef({});

    const abortRef = useRef(null);
    const resultsRef = useRef(null);

    useEffect(() => {
        plotsRef.current = plots;
    }, [plots]);

    // Отменяем незавершённый запрос при размонтировании
    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    const addHistory = (value) => {
        setHistory((prev) => {
            const next = [value, ...prev.filter((item) => item !== value)].slice(
                0,
                5,
            );
            try {
                localStorage.setItem(HISTORY_STORAGE, JSON.stringify(next));
            } catch {
                // localStorage может быть недоступен — не критично
            }
            return next;
        });
    };

    const saveKey = (event) => {
        event.preventDefault();
        const value = keyDraft.trim();

        if (!value) return;

        setApiKey(value);
        setKeyDraft("");
        setKeyPanelOpen(false);
        try {
            localStorage.setItem(API_KEY_STORAGE, value);
        } catch {
            // ignore
        }
    };

    const runSearch = async (searchQuery, targetPage = 1) => {
        if (!apiKey) {
            setKeyPanelOpen(true);
            return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setStatus("loading");
        setError(null);
        setMovies([]);
        setPage(targetPage);
        setLastQuery(searchQuery);

        try {
            const data = await searchMovies({
                query: searchQuery,
                page: targetPage,
                apiKey,
                signal: controller.signal,
            });

            if (data.Response === "False") {
                setTotalResults(0);
                if (/not found/i.test(data.Error || "")) {
                    setStatus("empty");
                } else {
                    setStatus("error");
                    setError(translateApiError(data.Error));
                }
                return;
            }

            setMovies(data.Search || []);
            setTotalResults(Number(data.totalResults) || 0);
            setStatus("success");
            addHistory(searchQuery);
            resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (err) {
            if (err.name === "AbortError") return;
            setStatus("error");
            setError("Не удалось выполнить запрос. Проверьте подключение к сети.");
        }
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        // Пока идёт запрос, повторные отправки игнорируются
        if (status === "loading") return;

        const value = query.trim();

        if (!value) {
            setStatus("error");
            setError("Введите название фильма");
            return;
        }

        runSearch(value, 1);
    };

    const handleExample = (value) => {
        setQuery(value);
        runSearch(value, 1);
    };

    const totalPages = Math.max(1, Math.ceil(totalResults / 10));

    const goToPage = (nextPage) => {
        if (nextPage < 1 || nextPage > totalPages || status === "loading") return;
        runSearch(lastQuery, nextPage);
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    // --- Подгрузка описаний для текущей страницы ---
    useEffect(() => {
        if (!apiKey || movies.length === 0) return;

        const controller = new AbortController();

        movies.forEach((movie) => {
            if (plotsRef.current[movie.imdbID] !== undefined) return;

            fetchMovieDetails({
                id: movie.imdbID,
                apiKey,
                signal: controller.signal,
            })
                .then((data) => {
                    const plot =
                        data.Plot && data.Plot !== "N/A" ? data.Plot : "";
                    plotsRef.current[movie.imdbID] = plot;
                    setPlots((prev) => ({ ...prev, [movie.imdbID]: plot }));
                })
                .catch((err) => {
                    if (err.name === "AbortError") return;
                    plotsRef.current[movie.imdbID] = "";
                    setPlots((prev) => ({ ...prev, [movie.imdbID]: "" }));
                });
        });

        return () => controller.abort();
    }, [movies, apiKey]);

    // --- Фильтр по году (на клиенте, для текущей страницы) ---
    const fromYear = yearFrom ? Number(yearFrom) : null;
    const toYear = yearTo ? Number(yearTo) : null;
    const yearError =
        fromYear !== null && toYear !== null && fromYear > toYear
            ? "«Год от» не может быть больше «Года до»"
            : "";

    const visibleMovies = yearError
        ? movies
        : movies.filter((movie) => {
              const year = Number.parseInt(movie.Year, 10);
              if (Number.isNaN(year)) return true;
              if (fromYear !== null && year < fromYear) return false;
              if (toYear !== null && year > toYear) return false;
              return true;
          });

    return (
        <div className="app">
            <header className="app__header">
                <h1 className="app__title">Поиск фильмов</h1>
                <p className="app__subtitle">
                    Данные OMDb API: постеры, годы, описания и постраничная
                    навигация.
                </p>
            </header>

            {!apiKey || keyPanelOpen ? (
                <form className="key-panel" onSubmit={saveKey}>
                    <h2 className="key-panel__title">Ключ OMDb API</h2>
                    <p className="key-panel__text">
                        Бесплатный ключ выдаётся на{" "}
                        <a
                            href="https://www.omdbapi.com/apikey.aspx"
                            target="_blank"
                            rel="noreferrer"
                        >
                            omdbapi.com
                        </a>
                        . Ключ сохраняется только в вашем браузере.
                    </p>
                    <div className="key-panel__row">
                        <input
                            type="text"
                            className="key-panel__input"
                            value={keyDraft}
                            onChange={(event) => setKeyDraft(event.target.value)}
                            placeholder="Вставьте ключ, например 1a2b3c4d"
                            aria-label="Ключ OMDb API"
                        />
                        <button type="submit" className="btn btn--primary">
                            Сохранить
                        </button>
                        {apiKey && (
                            <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={() => setKeyPanelOpen(false)}
                            >
                                Отмена
                            </button>
                        )}
                    </div>
                </form>
            ) : (
                <div className="key-hint">
                    <span>Ключ OMDb API подключён.</span>
                    <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                            setKeyDraft(apiKey);
                            setKeyPanelOpen(true);
                        }}
                    >
                        Сменить ключ
                    </button>
                </div>
            )}

            <form className="search" onSubmit={handleSubmit} role="search">
                <input
                    type="search"
                    className="search__input"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Например: Matrix"
                    aria-label="Название фильма"
                />
                <button
                    type="submit"
                    className="btn btn--primary search__button"
                    disabled={status === "loading" || !apiKey}
                >
                    {status === "loading" ? "Ищем…" : "Найти"}
                </button>
            </form>

            {status === "idle" && (
                <div className="hint">
                    <p>Введите название фильма и нажмите «Найти».</p>
                    <div className="hint__examples">
                        {EXAMPLES.map((example) => (
                            <button
                                key={example}
                                type="button"
                                className="hint__chip"
                                onClick={() => handleExample(example)}
                            >
                                {example}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {status === "loading" && (
                <div className="movie-grid" aria-busy="true">
                    {Array.from({ length: 8 }).map((_, index) => (
                        <div className="skeleton-card" key={index}>
                            <div className="skeleton-card__poster" />
                            <div className="skeleton-card__line" />
                            <div className="skeleton-card__line skeleton-card__line--short" />
                        </div>
                    ))}
                </div>
            )}

            {status === "error" && (
                <div className="message message--error" role="alert">
                    <h2>Ошибка</h2>
                    <p>{error}</p>
                    {lastQuery && (
                        <button
                            type="button"
                            className="btn btn--primary"
                            onClick={() => runSearch(lastQuery, page)}
                        >
                            Повторить
                        </button>
                    )}
                </div>
            )}

            {status === "empty" && (
                <div className="message">
                    <h2>Ничего не найдено</h2>
                    <p>
                        По запросу «{lastQuery}» фильмов не найдено. Попробуйте
                        другое название.
                    </p>
                </div>
            )}

            {status === "success" && (
                <section className="results" ref={resultsRef}>
                    <div className="results__bar">
                        <p className="results__count">
                            Найдено: <strong>{totalResults}</strong>
                        </p>

                        <div className="year-filter">
                            <label className="year-filter__field">
                                <span>Год от</span>
                                <input
                                    type="number"
                                    min="1888"
                                    max="2100"
                                    value={yearFrom}
                                    onChange={(event) => setYearFrom(event.target.value)}
                                />
                            </label>
                            <label className="year-filter__field">
                                <span>Год до</span>
                                <input
                                    type="number"
                                    min="1888"
                                    max="2100"
                                    value={yearTo}
                                    onChange={(event) => setYearTo(event.target.value)}
                                />
                            </label>
                            {(yearFrom || yearTo) && (
                                <button
                                    type="button"
                                    className="link-button"
                                    onClick={() => {
                                        setYearFrom("");
                                        setYearTo("");
                                    }}
                                >
                                    Сбросить
                                </button>
                            )}
                        </div>
                    </div>

                    {yearError && <p className="year-filter__error">{yearError}</p>}

                    {visibleMovies.length === 0 ? (
                        <div className="message">
                            <h2>На этой странице нет фильмов с таким годом</h2>
                            <p>
                                Фильтр по году применяется к текущей странице.
                                Попробуйте изменить диапазон или перейти на другую
                                страницу.
                            </p>
                        </div>
                    ) : (
                        <div className="movie-grid">
                            {visibleMovies.map((movie) => (
                                <MovieCard
                                    key={movie.imdbID}
                                    movie={movie}
                                    plot={plots[movie.imdbID]}
                                />
                            ))}
                        </div>
                    )}

                    <div className="pagination">
                        <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => goToPage(page - 1)}
                            disabled={page <= 1}
                        >
                            ← Предыдущая
                        </button>
                        <span className="pagination__info">
                            Страница {page} из {totalPages}
                        </span>
                        <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => goToPage(page + 1)}
                            disabled={page >= totalPages}
                        >
                            Следующая →
                        </button>
                    </div>
                </section>
            )}

            {history.length > 0 && (
                <section className="history">
                    <h2 className="history__title">Последние запросы</h2>
                    <div className="history__list">
                        {history.map((item) => (
                            <button
                                key={item}
                                type="button"
                                className="hint__chip"
                                onClick={() => handleExample(item)}
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

export default App;
