# fluttershy-face2face
This is a repository for the P2P course, which aims to implement WebRTC and some P2P architecture to create a collaborative video conference application.

# Priority (main features)
- MUST BE FIXED IMMEDIATELY
    - General connection stability
        - Error on joining with several peers in room
        - Error in both chrome/firefox
            - Maybe because of STUN server, who knows. 
    - Pumpa testing environment set-up and ready    
    - Drawing graph error:
        - Mixer elected by supreme is bugged visually
    - Prettier mixer visualisation    
    - Supreme leader leaves
        - Works, but need to find bugs
    
- Implement file sharing system
    - Display Shared files (immutable)
    - (Done) Download link shows up in chatlogs
    - Error handling for datachannel (not logging erros in timesync messages, catching errors in sendToAll)

- Tracking of network activity for topology / visual representation of network for debugging/presentation (graph)
    - Mixing peer nodes should be from mixingPeers (array)
    
- Support new p2p topologies 
    - Mixer election protocol (multiple mixers)  
     
- Set up Pumba testing environment

# Testing
- Latency test for audio
    - Scenario 1
        - 2 mixers
        - 2 clients
        - Send sound from client 1, register timestamp
        - Register when client 2 receives sound, timestamp
        - latency?
    - Scenario 2
        - 1 mixer
        - 2 clients
        - Same
    - Scenario 3
        - 0 mixers
        - 2 clients
    - Scenario 4,5,6
        - 3 mixers, 4 mixers, 5 mixers
        - 2 clients
-                 

# Nice-to-have
- Use auto-merge library to have collabarative text editing
- Implement https
    - Needs certificate to function, only possible when server is live
    - Test system with multiple users    
- Database for storing chatlogs
- Screenshare feature
- Homework feature 
    - Shared todo list
- Meeting schedule
    - What do we do in this meeting?
    - Or, timed notifications for meeting startup
- Screenshare feature
- Stream local video to group/call

- Nice to have chat commands

# Done 
- Chat system

- Need new main page
    - Join group chat by ID
        - Optionally with password for room
- Support multiple different callers at once.
- Make groups
    - Share links to groups
    - Set password to group?
    
- (Support new p2p topologies)
    - - (Done) Find a way to establish 'strong' clients from 'weak' clients
              - (done) Test and get speed of sending a predeterminate amount of bytes (mb/s estimate)
              - (done) Get bitrate of video channel between peers
              - (done) Get encoding time per video channel
          - Mixer election protocol (multiple mixers)
          - (Done) Mixer election protocol (single mixer)
              - Some client prompts the need for a mixer peer
                  - Experiences laggy video
                  - Experiences slow connection
                  - Other heuristics
                  - HARDCODE that the room needs n mixer peers (alternative to client starting the protocol)
              - Client.electMixers(nMixers, electionNum)
                  - For each peer, check if there is at least 5 bitrate reports (20s per report = 100s of average bitrate)
                      - Includes encoding times
                      - If one is lacking, delay election
                  - For each peer, send out 2mb array
                      - message object = (signaltype, array, origin, electionNum)
                      - Determine a band speed from this
                      - response object = (signal, speed, origin, averageEncodingTime, electionNum)
                  - Await responses from all peers
                      - Rank bitrates
                          - Pool average bitrates together
                          - Award points = peerAvgBitrates/TotalAverage * 100%
                      - Rank frameEncodingTime
                          - Award points = TotalEncodeTime/peerEncodeTime
                      - Rank array transfer time
                          - Award points = peerSpeed/ TotalSpeed * 100%
                  - Send points to all
                  - Await points from all
                      - Pick n highest ranked peers as mixers
                          - If just one mixer, and client is not mixer -> immediately freeze encodings non-mixers
                          - If just one mixer, and client becomes mixer -> switch to mixer mode and keep streaming to all
                      - // message object (signal, n-array of ranked mixers, origin, electionNum)

    - Find a way to mash video streams together (video)
    - Find a way to mash video streams together (audio)
    - Change mixer on runtime, instead of hardcoding on launch
    - Enable the pausing of streams so only peers have to encode to the mixer
    - (Find a way to establish 'strong' clients from 'weak' clients)
            - (done) Test and get speed of sending a predeterminate amount of bytes (mb/s estimate)
            - (done) Get bitrate of video channel between peers
            - (done) Get encoding time per video channel


- Display different tabs with content for all users
    - Tabs include images, or simple display files
      
# Interesting Links
- (webRTC stats) https://www.w3.org/TR/webrtc-stats/#dom-rtcoutboundrtpstreamstats-totalpacketsenddelay
- (For text editing) https://blog.datproject.org/2019/03/05/caracara-react-dat-automerge/
- https://users-cs.au.dk/bouvin/dBIoTP2PC/2020/projects/#panzoom
- https://letsencrypt.org/
    - for certificates etc
- https://developers.google.com/web/tools/puppeteer/
    - for site testing
- https://alexei-led.github.io/post/pumba_docker_chaos_testing/
    - for for testing networks inside docker
- https://peertube.dk/
- https://news.ycombinator.com/item?id=23398261
- https://webtorrent.io/
- https://github.com/webrtc/samples/blob/gh-pages/src/content/peerconnection/multiple/js/main.js
    - For multiple streams. Mesh style.
