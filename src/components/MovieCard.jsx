import { useState } from "react";
import "./MovieCard.css";

const TYPE_LABELS = {
    movie: "Фильм",
    series: "Сериал",
    episode: "Эпизод",
};

export function MovieCard({ movie, plot }) {
    const [posterFailed, setPosterFailed] = useState(false);
    const hasPoster =
        movie.Poster && movie.Poster !== "N/A" && !posterFailed;

    return (
        <article className="movie-card">
            <div className="movie-card__poster">
                {hasPoster ? (
                    <img
                        src={movie.Poster}
                        alt={`Постер «${movie.Title}»`}
                        loading="lazy"
                        onError={() => setPosterFailed(true)}
                    />
                ) : (
                    <div className="movie-card__placeholder">
                        <span aria-hidden="true">🎬</span>
                        <span>Нет постера</span>
                    </div>
                )}
                <span className="movie-card__type">
                    {TYPE_LABELS[movie.Type] || movie.Type}
                </span>
            </div>

            <div className="movie-card__body">
                <h3 className="movie-card__title">{movie.Title}</h3>
                <p className="movie-card__year">{movie.Year}</p>

                {plot === undefined ? (
                    <p className="movie-card__plot movie-card__plot--loading">
                        Загрузка описания…
                    </p>
                ) : plot ? (
                    <p className="movie-card__plot">{plot}</p>
                ) : (
                    <p className="movie-card__plot movie-card__plot--empty">
                        Описание недоступно
                    </p>
                )}
            </div>
        </article>
    );
}
