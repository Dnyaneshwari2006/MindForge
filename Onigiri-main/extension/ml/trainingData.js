// MindForge — ML Training Data
// Curated labeled examples for the Naive Bayes + KNN classifier.
// Each entry: { url, title, snippet, category, contentType }
// Categories: productive, distraction, neutral
// Content types: text, video, interactive, audio, mixed

export const TRAINING_DATA = [
  // ═══════════════════════════════════════
  //  PRODUCTIVE — Documentation & Reference
  // ═══════════════════════════════════════
  { url: 'developer.mozilla.org/en-US/docs/Web/JavaScript', title: 'JavaScript | MDN Web Docs', snippet: 'javascript programming language reference documentation web api dom elements functions variables', category: 'productive', contentType: 'text' },
  { url: 'docs.python.org/3/tutorial', title: 'The Python Tutorial', snippet: 'python tutorial introduction programming language data structures modules input output errors classes', category: 'productive', contentType: 'text' },
  { url: 'reactjs.org/docs/getting-started', title: 'Getting Started – React', snippet: 'react javascript library building user interfaces components state props rendering hooks jsx', category: 'productive', contentType: 'text' },
  { url: 'docs.oracle.com/javase/tutorial', title: 'Java Tutorials', snippet: 'java programming tutorials object oriented classes inheritance interfaces collections generics', category: 'productive', contentType: 'text' },
  { url: 'learn.microsoft.com/en-us/dotnet', title: '.NET documentation', snippet: 'dotnet csharp programming framework tutorials api documentation development build applications', category: 'productive', contentType: 'text' },
  { url: 'kubernetes.io/docs/concepts', title: 'Kubernetes Concepts', snippet: 'kubernetes container orchestration pods services deployments clusters nodes scheduling scaling', category: 'productive', contentType: 'text' },
  { url: 'flask.palletsprojects.com/en/latest', title: 'Flask Documentation', snippet: 'flask python web framework routing templates requests responses middleware wsgi application', category: 'productive', contentType: 'text' },
  { url: 'expressjs.com/en/guide/routing', title: 'Express routing', snippet: 'express nodejs routing http methods middleware request response api web application framework', category: 'productive', contentType: 'text' },

  // ═══════════════════════════════════════
  //  PRODUCTIVE — Online Courses & Learning
  // ═══════════════════════════════════════
  { url: 'coursera.org/learn/machine-learning', title: 'Machine Learning | Coursera', snippet: 'machine learning course supervised unsupervised neural networks regression classification stanford', category: 'productive', contentType: 'video' },
  { url: 'udemy.com/course/the-web-developer-bootcamp', title: 'Web Developer Bootcamp | Udemy', snippet: 'web development bootcamp html css javascript nodejs express mongodb full stack curriculum', category: 'productive', contentType: 'video' },
  { url: 'edx.org/course/introduction-to-computer-science', title: 'CS50 Introduction to Computer Science', snippet: 'computer science introduction algorithms data structures programming c python sql web development harvard', category: 'productive', contentType: 'video' },
  { url: 'khanacademy.org/math/calculus', title: 'Calculus | Khan Academy', snippet: 'calculus limits derivatives integrals differential equations functions mathematics education learn', category: 'productive', contentType: 'video' },
  { url: 'freecodecamp.org/learn', title: 'freeCodeCamp Learn', snippet: 'learn coding programming web development responsive design javascript algorithms data structures projects', category: 'productive', contentType: 'interactive' },
  { url: 'codecademy.com/learn/learn-python-3', title: 'Learn Python 3 | Codecademy', snippet: 'learn python programming interactive coding exercises functions loops lists dictionaries classes modules', category: 'productive', contentType: 'interactive' },
  { url: 'brilliant.org/courses/computer-science', title: 'Computer Science | Brilliant', snippet: 'computer science algorithms logic programming fundamentals interactive learning problem solving', category: 'productive', contentType: 'interactive' },

  // ═══════════════════════════════════════
  //  PRODUCTIVE — Coding & Development
  // ═══════════════════════════════════════
  { url: 'github.com/facebook/react', title: 'facebook/react: A JavaScript library for building user interfaces', snippet: 'react repository source code components rendering virtual dom open source library javascript framework development', category: 'productive', contentType: 'text' },
  { url: 'stackoverflow.com/questions/tagged/javascript', title: 'Newest javascript Questions - Stack Overflow', snippet: 'javascript questions answers programming debugging error solution code help community development', category: 'productive', contentType: 'text' },
  { url: 'leetcode.com/problems/two-sum', title: 'Two Sum - LeetCode', snippet: 'two sum algorithm problem solve coding interview data structure array hash map solution approach complexity', category: 'productive', contentType: 'interactive' },
  { url: 'kaggle.com/competitions', title: 'Competitions | Kaggle', snippet: 'data science competitions machine learning datasets notebooks kernels models training prediction kaggle', category: 'productive', contentType: 'interactive' },
  { url: 'dev.to/article/understanding-async-await', title: 'Understanding Async/Await in JavaScript', snippet: 'async await javascript promises asynchronous programming tutorial explanation guide code examples', category: 'productive', contentType: 'text' },
  { url: 'medium.com/towards-data-science/neural-networks-explained', title: 'Neural Networks Explained', snippet: 'neural networks deep learning machine learning artificial intelligence layers weights backpropagation training', category: 'productive', contentType: 'text' },
  { url: 'replit.com/languages/python3', title: 'Python Online Compiler | Replit', snippet: 'python online compiler ide code editor run execute program development interface terminal', category: 'productive', contentType: 'interactive' },
  { url: 'colab.research.google.com/notebooks', title: 'Google Colab', snippet: 'jupyter notebook python machine learning tensorflow pytorch data science gpu free cloud computing research', category: 'productive', contentType: 'interactive' },
  { url: 'notion.so/workspace', title: 'Notion – Notes & Project Management', snippet: 'notes project management workspace organization tasks documents wiki database templates productivity planning', category: 'productive', contentType: 'text' },

  // ═══════════════════════════════════════
  //  PRODUCTIVE — Academic & Research
  // ═══════════════════════════════════════
  { url: 'scholar.google.com/scholar?q=machine+learning', title: 'Google Scholar', snippet: 'academic papers research publications citations journal articles scientific literature peer reviewed', category: 'productive', contentType: 'text' },
  { url: 'arxiv.org/abs/2301.01234', title: 'Attention Is All You Need - arXiv', snippet: 'research paper transformer model attention mechanism natural language processing neural architecture', category: 'productive', contentType: 'text' },
  { url: 'researchgate.net/publication', title: 'ResearchGate Publication', snippet: 'research publication academic paper study findings methodology results discussion conference journal', category: 'productive', contentType: 'text' },
  { url: 'wikipedia.org/wiki/Algorithm', title: 'Algorithm - Wikipedia', snippet: 'algorithm computational procedure step by step instructions problem solving mathematics computer science definition', category: 'productive', contentType: 'text' },
  { url: 'wolframalpha.com/input?i=integral', title: 'Wolfram Alpha', snippet: 'computational knowledge engine mathematics calculation integral derivative equation solve formula', category: 'productive', contentType: 'interactive' },

  // ═══════════════════════════════════════
  //  PRODUCTIVE — YouTube Educational
  // ═══════════════════════════════════════
  { url: 'youtube.com/watch?v=edu1', title: 'Full Machine Learning Course for Beginners', snippet: 'machine learning tutorial course beginner lecture supervised unsupervised algorithms python scikit learn', category: 'productive', contentType: 'video' },
  { url: 'youtube.com/watch?v=edu2', title: 'Operating Systems Lecture 1 - Introduction', snippet: 'operating system lecture university course introduction processes threads memory management scheduling kernel', category: 'productive', contentType: 'video' },
  { url: 'youtube.com/watch?v=edu3', title: 'Data Structures Easy to Advanced Course - Full Tutorial', snippet: 'data structures course tutorial arrays linked lists trees graphs hash tables algorithms complexity analysis', category: 'productive', contentType: 'video' },
  { url: 'youtube.com/watch?v=edu4', title: 'How to solve coding interview problems', snippet: 'coding interview problem solving algorithm technique dynamic programming recursion solution approach leetcode', category: 'productive', contentType: 'video' },
  { url: 'youtube.com/watch?v=edu5', title: 'Linear Algebra Full Course - MIT OpenCourseWare', snippet: 'linear algebra matrices vectors eigenvalues determinants spaces transformations mathematics lecture mit', category: 'productive', contentType: 'video' },
  { url: 'youtube.com/watch?v=edu6', title: 'React Tutorial for Beginners - Programming with Mosh', snippet: 'react tutorial beginner components hooks state props jsx rendering web development javascript framework', category: 'productive', contentType: 'video' },
  { url: 'youtube.com/watch?v=edu7', title: 'Database Systems Cornell University Course', snippet: 'database systems course sql relational algebra normalization transactions query optimization indexing cornell lecture', category: 'productive', contentType: 'video' },
  { url: 'youtube.com/watch?v=edu8', title: 'Deep Learning Specialization Explained', snippet: 'deep learning neural network convolutional recurrent natural language processing computer vision training', category: 'productive', contentType: 'video' },

  // ═══════════════════════════════════════
  //  DISTRACTION — Social Media
  // ═══════════════════════════════════════
  { url: 'instagram.com/explore', title: 'Instagram Explore', snippet: 'photos videos reels stories explore trending viral memes influencer lifestyle fashion selfie', category: 'distraction', contentType: 'mixed' },
  { url: 'twitter.com/home', title: 'Home / X', snippet: 'tweets timeline trending topics hashtags viral posts retweets likes social media feed discourse', category: 'distraction', contentType: 'text' },
  { url: 'facebook.com/feed', title: 'Facebook', snippet: 'news feed posts photos friends likes comments sharing social media groups events marketplace stories', category: 'distraction', contentType: 'mixed' },
  { url: 'tiktok.com/foryou', title: 'TikTok - For You', snippet: 'for you page short videos viral trends dance challenges memes comedy entertainment social media creators', category: 'distraction', contentType: 'video' },
  { url: 'snapchat.com/discover', title: 'Snapchat Discover', snippet: 'snaps stories discover news entertainment celebrity gossip trending viral social media ephemeral', category: 'distraction', contentType: 'mixed' },
  { url: 'pinterest.com/search', title: 'Pinterest', snippet: 'pins boards inspiration aesthetic photos ideas fashion home decor recipes crafts lifestyle visual', category: 'distraction', contentType: 'mixed' },
  { url: 'tumblr.com/dashboard', title: 'Tumblr Dashboard', snippet: 'posts reblog memes fandom fan art aesthetic gifs viral social media blog personal creative', category: 'distraction', contentType: 'mixed' },

  // ═══════════════════════════════════════
  //  DISTRACTION — Entertainment & Streaming
  // ═══════════════════════════════════════
  { url: 'netflix.com/browse', title: 'Netflix', snippet: 'movies tv shows series streaming watch binge drama comedy thriller anime original new release trending', category: 'distraction', contentType: 'video' },
  { url: 'twitch.tv/directory', title: 'Twitch Directory', snippet: 'live streams gaming esports streamers chat community broadcast watch entertainment gameplay fortnite valorant', category: 'distraction', contentType: 'video' },
  { url: 'disneyplus.com/home', title: 'Disney+ Home', snippet: 'disney streaming movies shows marvel star wars pixar series animated entertainment family watch', category: 'distraction', contentType: 'video' },
  { url: 'hulu.com/hub/home', title: 'Hulu', snippet: 'streaming tv shows movies originals watch live tv entertainment series episodes browse new trending', category: 'distraction', contentType: 'video' },
  { url: 'primevideo.com', title: 'Amazon Prime Video', snippet: 'streaming movies tv shows originals watch amazon entertainment series thriller drama comedy action', category: 'distraction', contentType: 'video' },
  { url: 'crunchyroll.com/videos/anime', title: 'Crunchyroll - Watch Anime', snippet: 'anime streaming watch episodes subbed dubbed japanese animation manga series popular seasonal new', category: 'distraction', contentType: 'video' },

  // ═══════════════════════════════════════
  //  DISTRACTION — YouTube Entertainment
  // ═══════════════════════════════════════
  { url: 'youtube.com/watch?v=ent1', title: 'FUNNIEST MOMENTS OF THE YEAR Compilation', snippet: 'funny compilation hilarious moments fails memes humor comedy entertainment viral best clips', category: 'distraction', contentType: 'video' },
  { url: 'youtube.com/watch?v=ent2', title: 'I Spent 24 Hours in a Haunted House Challenge', snippet: 'challenge 24 hours haunted house vlog dare extreme prank scary overnight adventure content creator', category: 'distraction', contentType: 'video' },
  { url: 'youtube.com/watch?v=ent3', title: 'CELEBRITY DRAMA EXPOSED - Full Tea Spill', snippet: 'celebrity drama gossip exposed tea spill controversy cancelled beef feud clap back reaction response', category: 'distraction', contentType: 'video' },
  { url: 'youtube.com/watch?v=ent4', title: 'Unboxing the MOST EXPENSIVE iPhone Ever', snippet: 'unboxing iphone expensive luxury tech gadget review haul shopping purchase product reveal first look', category: 'distraction', contentType: 'video' },
  { url: 'youtube.com/watch?v=ent5', title: 'Epic Fortnite Win Compilation', snippet: 'fortnite gaming compilation epic win victory royale gameplay montage highlights battle royale kills', category: 'distraction', contentType: 'video' },
  { url: 'youtube.com/watch?v=ent6', title: 'ASMR Eating Spicy Noodles Mukbang', snippet: 'asmr eating mukbang food spicy noodles chewing sounds satisfying triggers relaxing eating show', category: 'distraction', contentType: 'video' },
  { url: 'youtube.com/watch?v=ent7', title: 'Reacting to My Old Cringey Videos', snippet: 'reaction cringe old videos embarrassing funny throwback nostalgia compilation react response commentary', category: 'distraction', contentType: 'video' },
  { url: 'youtube.com/watch?v=ent8', title: 'Top 10 Anime Fights of All Time', snippet: 'anime fights top ranking best battle scenes action epic moments shonen series dragon ball naruto', category: 'distraction', contentType: 'video' },

  // ═══════════════════════════════════════
  //  DISTRACTION — Gaming & Memes
  // ═══════════════════════════════════════
  { url: 'reddit.com/r/memes', title: 'r/memes - Reddit', snippet: 'memes funny humor internet culture viral jokes trending shitpost dank relatable upvote community', category: 'distraction', contentType: 'mixed' },
  { url: 'reddit.com/r/gaming', title: 'r/gaming - Reddit', snippet: 'gaming video games screenshots memes funny moments updates news releases pc console playstation xbox', category: 'distraction', contentType: 'mixed' },
  { url: '9gag.com/hot', title: '9GAG - Best Funny Memes', snippet: 'memes funny photos gifs viral humor jokes hot trending internet comedy entertainment laugh', category: 'distraction', contentType: 'mixed' },
  { url: 'store.steampowered.com', title: 'Steam Store', snippet: 'steam games pc gaming buy download sale deals new releases popular free to play multiplayer single player', category: 'distraction', contentType: 'interactive' },
  { url: 'twitch.tv/xqc', title: 'xQc Live Stream - Twitch', snippet: 'xqc streamer live gaming reaction chat just chatting variety entertainment stream community twitch', category: 'distraction', contentType: 'video' },

  // ═══════════════════════════════════════
  //  DISTRACTION — News & Gossip (non-academic)
  // ═══════════════════════════════════════
  { url: 'buzzfeed.com/trending', title: 'BuzzFeed Trending', snippet: 'trending quizzes celebrity gossip viral stories entertainment lifestyle food pop culture lists memes', category: 'distraction', contentType: 'text' },
  { url: 'tmz.com', title: 'TMZ Celebrity News', snippet: 'celebrity news gossip hollywood entertainment drama scandal exclusive photos paparazzi breaking shocking', category: 'distraction', contentType: 'text' },
  { url: 'dailymail.co.uk/tvshowbiz', title: 'Daily Mail Showbiz', snippet: 'celebrity photos news gossip entertainment showbiz fashion lifestyle relationships breakup hollywood', category: 'distraction', contentType: 'text' },

  // ═══════════════════════════════════════
  //  DISTRACTION — Shopping
  // ═══════════════════════════════════════
  { url: 'amazon.com/deals', title: 'Amazon Deals', snippet: 'deals shopping buy discount sale products electronics fashion today offers lightning deal best sellers', category: 'distraction', contentType: 'interactive' },
  { url: 'flipkart.com/offers', title: 'Flipkart Offers', snippet: 'shopping offers discount sale electronics mobiles fashion deals buy online india ecommerce products', category: 'distraction', contentType: 'interactive' },
  { url: 'myntra.com/shop', title: 'Myntra Fashion Shopping', snippet: 'fashion shopping clothes shoes brands sale trending style outfit casual formal beauty accessories', category: 'distraction', contentType: 'interactive' },

  // ═══════════════════════════════════════
  //  NEUTRAL — Productivity tools (goal-dependent)
  // ═══════════════════════════════════════
  { url: 'mail.google.com/mail', title: 'Gmail', snippet: 'email inbox messages compose reply forward archive labels filters communication correspondence', category: 'neutral', contentType: 'text' },
  { url: 'calendar.google.com', title: 'Google Calendar', snippet: 'calendar events schedule meetings appointments reminders planning time management day week month', category: 'neutral', contentType: 'interactive' },
  { url: 'docs.google.com/document', title: 'Google Docs', snippet: 'document writing text editor collaboration sharing formatting word processor online cloud edit', category: 'neutral', contentType: 'text' },
  { url: 'sheets.google.com/spreadsheet', title: 'Google Sheets', snippet: 'spreadsheet data tables formulas functions charts analysis rows columns calculations numbers', category: 'neutral', contentType: 'interactive' },
  { url: 'drive.google.com/drive', title: 'Google Drive', snippet: 'cloud storage files folders documents photos upload download share organize manage backup', category: 'neutral', contentType: 'interactive' },
  { url: 'slack.com/workspace', title: 'Slack', snippet: 'messaging team communication channels workspace notifications chat collaboration threads discussion', category: 'neutral', contentType: 'text' },
  { url: 'discord.com/channels', title: 'Discord', snippet: 'messaging chat servers channels voice text community gaming friends social voice call group', category: 'neutral', contentType: 'text' },
  { url: 'zoom.us/meeting', title: 'Zoom Meeting', snippet: 'video meeting conference call virtual classroom screen share recording webinar participants join', category: 'neutral', contentType: 'video' },
  { url: 'teams.microsoft.com', title: 'Microsoft Teams', snippet: 'teams meeting chat collaboration office channels files tasks planner integration video call', category: 'neutral', contentType: 'mixed' },

  // ═══════════════════════════════════════
  //  NEUTRAL — News (can be productive or not)
  // ═══════════════════════════════════════
  { url: 'bbc.com/news', title: 'BBC News', snippet: 'news world politics business technology science health environment breaking stories journalism', category: 'neutral', contentType: 'text' },
  { url: 'cnn.com', title: 'CNN Breaking News', snippet: 'news politics world us opinion business health entertainment technology science weather breaking', category: 'neutral', contentType: 'text' },
  { url: 'nytimes.com', title: 'The New York Times', snippet: 'news opinion editorial world us politics business technology science arts style food travel', category: 'neutral', contentType: 'text' },
  { url: 'theguardian.com', title: 'The Guardian', snippet: 'news world opinion sport culture lifestyle environment business technology science education media', category: 'neutral', contentType: 'text' },

  // ═══════════════════════════════════════
  //  NEUTRAL — Search & General
  // ═══════════════════════════════════════
  { url: 'google.com/search', title: 'Google Search', snippet: 'search results web pages information query find lookup browse internet knowledge discover', category: 'neutral', contentType: 'text' },
  { url: 'bing.com/search', title: 'Bing Search', snippet: 'search results web information find discover browse internet pages knowledge query lookup', category: 'neutral', contentType: 'text' },
  { url: 'wikipedia.org/wiki/Main_Page', title: 'Wikipedia', snippet: 'encyclopedia knowledge information articles history science culture reference community free wiki', category: 'neutral', contentType: 'text' },

  // ═══════════════════════════════════════
  //  NEUTRAL — YouTube Mixed / Ambiguous
  // ═══════════════════════════════════════
  { url: 'youtube.com', title: 'YouTube', snippet: 'videos trending recommended home feed creators content music gaming entertainment education vlogs', category: 'neutral', contentType: 'video' },
  { url: 'youtube.com/watch?v=mix1', title: 'Day In The Life of a Software Engineer', snippet: 'day in life software engineer tech lifestyle work routine coding office productivity vlog', category: 'neutral', contentType: 'video' },
  { url: 'youtube.com/watch?v=mix2', title: 'Study With Me - 2 Hour Pomodoro', snippet: 'study with me pomodoro timer focus ambient music real time motivation concentration silent library', category: 'productive', contentType: 'video' },
  { url: 'youtube.com/watch?v=mix3', title: 'Lofi Hip Hop Radio - Beats to Study/Relax to', snippet: 'lofi hip hop beats study relax chill music stream radio ambient focus background concentration', category: 'neutral', contentType: 'audio' },

  // ═══════════════════════════════════════
  //  PRODUCTIVE — Reddit (educational subreddits)
  // ═══════════════════════════════════════
  { url: 'reddit.com/r/learnprogramming', title: 'r/learnprogramming - Reddit', snippet: 'learn programming help beginner questions coding tutorial resources advice career development software', category: 'productive', contentType: 'text' },
  { url: 'reddit.com/r/machinelearning', title: 'r/MachineLearning - Reddit', snippet: 'machine learning research papers discussion models deep learning optimization neural networks transformers', category: 'productive', contentType: 'text' },
  { url: 'reddit.com/r/datascience', title: 'r/datascience - Reddit', snippet: 'data science career advice tools analysis statistics python pandas visualization industry discussion', category: 'productive', contentType: 'text' },

  // ═══════════════════════════════════════
  //  Additional edge cases
  // ═══════════════════════════════════════
  { url: 'chat.openai.com/chat', title: 'ChatGPT', snippet: 'ai chatbot conversation assistant question answer help code generation writing explanation language model', category: 'productive', contentType: 'interactive' },
  { url: 'claude.ai/chat', title: 'Claude', snippet: 'ai assistant chatbot conversation help analysis coding writing explanation reasoning research helpful', category: 'productive', contentType: 'interactive' },
  { url: 'spotify.com/playlist', title: 'Spotify Playlist', snippet: 'music playlist songs streaming listen album artist podcast discover popular trending charts genres', category: 'neutral', contentType: 'audio' },
  { url: 'open.spotify.com/track', title: 'Spotify Track', snippet: 'song music listen streaming audio player track artist album play queue lyrics', category: 'neutral', contentType: 'audio' },
  { url: 'w3schools.com/html/html_intro', title: 'HTML Introduction - W3Schools', snippet: 'html introduction web pages elements tags attributes tutorial learn basics structure markup language', category: 'productive', contentType: 'text' },
  { url: 'geeksforgeeks.org/data-structures', title: 'Data Structures - GeeksforGeeks', snippet: 'data structures array linked list tree graph stack queue heap hash table algorithms implementation', category: 'productive', contentType: 'text' },
  { url: 'hackerrank.com/challenges', title: 'HackerRank Challenges', snippet: 'coding challenges practice algorithms problem solving interview preparation programming competitions skills', category: 'productive', contentType: 'interactive' },
  { url: 'codeforces.com/problemset', title: 'Codeforces Problemset', snippet: 'competitive programming problems algorithms mathematics implementation data structures contest practice difficulty', category: 'productive', contentType: 'interactive' },

  // ═══════════════════════════════════════
  //  PRODUCTIVE — Podcasts & Focus Audio
  // ═══════════════════════════════════════
  { url: 'open.spotify.com/show/lexfridman', title: 'Lex Fridman Podcast', snippet: 'podcast artificial intelligence technology science research deep conversations engineering mathematics philosophy', category: 'productive', contentType: 'audio' },
  { url: 'open.spotify.com/show/hubermanlab', title: 'Huberman Lab Podcast', snippet: 'neuroscience health science research brain optimization focus sleep productivity learning protocols evidence', category: 'productive', contentType: 'audio' },
  { url: 'podcasts.apple.com/programming', title: 'Syntax - Web Dev Podcast', snippet: 'web development podcast javascript react css nodejs frameworks tools tips best practices coding', category: 'productive', contentType: 'audio' },
  { url: 'open.spotify.com/playlist/focusmusic', title: 'Deep Focus Study Music', snippet: 'focus music study concentration deep work instrumental ambient background productivity white noise', category: 'productive', contentType: 'audio' },
  { url: 'youtube.com/watch?v=focus1', title: 'Brown Noise for Studying - 10 Hours', snippet: 'brown noise study focus concentration ambient sound background noise productivity deep work brain calm', category: 'productive', contentType: 'audio' },
  { url: 'youtube.com/watch?v=focus2', title: 'Study With Me 3 Hour Pomodoro Timer', snippet: 'study with me pomodoro timer focus music real time motivation library productivity progress session', category: 'productive', contentType: 'video' },

  // ═══════════════════════════════════════
  //  PRODUCTIVE — Generic Blogs & Articles
  // ═══════════════════════════════════════
  { url: 'towardsdatascience.com/transformers', title: 'Understanding Transformers in Deep Learning', snippet: 'transformers architecture attention mechanism self attention deep learning models nlp computer vision explained', category: 'productive', contentType: 'text' },
  { url: 'blog.pragmaticengineer.com', title: 'The Pragmatic Engineer Blog', snippet: 'software engineering career advice system design architecture tech industry best practices senior engineer', category: 'productive', contentType: 'text' },
  { url: 'martinfowler.com/articles/microservices', title: 'Microservices - Martin Fowler', snippet: 'microservices architecture distributed systems design patterns software engineering deployment services api', category: 'productive', contentType: 'text' },
  { url: 'overleaf.com/project', title: 'Overleaf - LaTeX Editor', snippet: 'latex editor academic writing paper thesis document scientific publication formatting mathematics equations', category: 'productive', contentType: 'interactive' },
  { url: 'gemini.google.com/app', title: 'Google Gemini AI', snippet: 'ai assistant chatbot help question answer reasoning analysis writing code generation research', category: 'productive', contentType: 'interactive' },

  // ═══════════════════════════════════════
  //  DISTRACTION — Gossip, Lifestyle, Viral
  // ═══════════════════════════════════════
  { url: 'reddit.com/r/relationship_advice', title: 'r/relationship_advice - Reddit', snippet: 'relationship advice dating love breakup cheating drama personal stories emotional vent help', category: 'distraction', contentType: 'text' },
  { url: 'reddit.com/r/AmItheAsshole', title: 'r/AmItheAsshole - Reddit', snippet: 'aita judgment stories conflict drama interpersonal social dilemma verdict vote personal', category: 'distraction', contentType: 'text' },
  { url: 'youtube.com/watch?v=ent9', title: 'I Tried Every Fast Food Chain Ranked', snippet: 'food review taste test ranking fast food challenge vlog entertainment lifestyle trying eating', category: 'distraction', contentType: 'video' },
  { url: 'youtube.com/watch?v=ent10', title: 'GRWM for the Concert + Vlog', snippet: 'get ready with me grwm outfit fashion concert vlog lifestyle beauty makeup haul routine', category: 'distraction', contentType: 'video' },
  { url: 'open.spotify.com/playlist/partymix', title: 'Ultimate Party Mix 2026', snippet: 'party mix dance hits club music top charts trending popular songs dj remix bass drop', category: 'distraction', contentType: 'audio' },

  // ═══════════════════════════════════════
  //  NEUTRAL — Generic tools & mixed
  // ═══════════════════════════════════════
  { url: 'open.spotify.com/browse', title: 'Spotify Browse', snippet: 'browse discover music podcasts new releases charts genres playlists recommendations for you explore', category: 'neutral', contentType: 'audio' },
  { url: 'translate.google.com', title: 'Google Translate', snippet: 'translation language text document website translate convert multilingual communication tool utility', category: 'neutral', contentType: 'interactive' },
  { url: 'canva.com/design', title: 'Canva Design', snippet: 'design graphic template presentation poster social media creative visual drag drop editor layout', category: 'neutral', contentType: 'interactive' },
  { url: 'figma.com/file', title: 'Figma Design File', snippet: 'design ui ux interface prototype wireframe components layout collaboration creative vector graphics', category: 'neutral', contentType: 'interactive' },
];

// Pre-computed vocabulary: the most discriminative tokens across the training data.
// This will be built dynamically at initialization from TRAINING_DATA.
export function buildVocabulary() {
  const docFreq = {};   // token → number of documents it appears in
  const totalDocs = TRAINING_DATA.length;

  for (const entry of TRAINING_DATA) {
    const text = `${entry.title} ${entry.snippet} ${entry.url}`.toLowerCase();
    const tokens = new Set(text.split(/[\s/.:,\-_?&=]+/).filter(t => t.length > 2));
    for (const token of tokens) {
      docFreq[token] = (docFreq[token] || 0) + 1;
    }
  }

  // Keep tokens that appear in at least 2 documents and at most 80% of documents
  // (removes too rare and too common tokens)
  const vocab = [];
  for (const [token, count] of Object.entries(docFreq)) {
    if (count >= 2 && count <= totalDocs * 0.8) {
      vocab.push(token);
    }
  }

  // Sort alphabetically for consistent indexing
  vocab.sort();
  return vocab;
}
