const apple = (id, artist, title, year) => ({ apple: id, artist, title, year, link: `https://music.apple.com/us/song/${id}`, via: 'Apple Music' });

export const SONGS = {
  1877: {
    then: { src: 'audio/edison-mary-had-a-little-lamb.mp3', artist: 'Thomas Edison', title: 'Mary Had a Little Lamb', year: 1927, link: 'https://commons.wikimedia.org/wiki/File:Thomas_Edison_Mary_had_lamb.ogg', via: 'Wikimedia Commons' },
    today: apple(930561342, 'Stevie Ray Vaughan & Double Trouble', 'Mary Had a Little Lamb', 1983),
  },
  1925: {
    then: apple(202211723, 'Bessie Smith & Louis Armstrong', 'St. Louis Blues', 1925),
    today: apple(1443181740, 'Herbie Hancock feat. Stevie Wonder', 'St. Louis Blues', 1998),
  },
  1948: {
    then: apple(1459444213, 'Thelonious Monk', "'Round Midnight", 1947),
    today: apple(724573667, 'Lee Konitz, Brad Mehldau & Charlie Haden', "'Round Midnight", 1997),
  },
  1967: {
    then: apple(1441164721, 'The Beatles', "Sgt. Pepper's Lonely Hearts Club Band", 1967),
    today: apple(1573250534, 'The Beatles', "Sgt. Pepper's Lonely Hearts Club Band (2017 Mix)", 2017),
  },
  1982: {
    then: apple(185717604, 'Toto', 'Africa', 1982),
    today: apple(1450271000, 'Weezer', 'Africa', 2018),
  },
  1991: {
    then: apple(1556921231, 'my bloody valentine', 'only shallow', 1991),
    today: apple(1738387574, 'Wisp', 'Your face', 2023),
  },
  2001: {
    then: apple(1440924808, 'Taylor Swift', 'Love Story', 2008),
    today: apple(1552791427, 'Taylor Swift', "Love Story (Taylor's Version)", 2021),
  },
  2013: {
    then: apple(652039247, 'Deafheaven', 'Dream House', 2013),
    today: apple(1697032081, 'Deafheaven', 'Dream House (2023 Remix)', 2023),
  },
  2016: {
    then: apple(1615488589, 'Migos feat. Lil Uzi Vert', 'Bad and Boujee', 2016),
    today: apple(1737320971, 'Future, Metro Boomin & Kendrick Lamar', 'Like That', 2024),
  },
  2026: {
    today: apple(1739659142, 'Billie Eilish', 'BIRDS OF A FEATHER', 2024),
  },
};

export const songFor = (year, then) => {
  const pair = SONGS[year];
  return (then && pair.then) || pair.today;
};

export const songLabel = (song) => `${song.artist} · ${song.title} (${song.year})`;
