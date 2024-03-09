import React, { useState, useRef, useEffect } from 'react'
import { Device, detectDevice } from 'mediasoup-client'
import { io } from 'socket.io-client'
import { toast, Toaster } from 'react-hot-toast'
import { v4 as uuidv4 } from 'uuid'

const Room = () => {

  const [socket, setSocket] = useState()
  const [peers, setPeers] = useState([])

  const socketRef = useRef()
  const mediasoupDevice = useRef()
  const receiveTransport = useRef({})
  const produceTransport = useRef()
  const localStreamRef = useRef()
  const audioProducer = useRef()
  const audioProducer2 = useRef()
  const videoProducer = useRef()
  const videoProducer2 = useRef()
  const localStreamElemRef = useRef()
  const localScreenStreamRef = useRef()
  const localScreenStreamElemRef = useRef()
  const audioProducerId = useRef()
  const videoProducerId = useRef()
  const audioProducerId2 = useRef()
  const videoProducerId2 = useRef()
  const consumers = useRef(new Map())
  const localVideoCont = useRef()
  const localScreenCont = useRef()
  const screenShareStarted = useRef(false)
  const remoteStreamsRef = useRef({})
  const peersRef = useRef([])
  const micElem = useRef()
  const videoElem = useRef()
  const currentMicState = useRef(true)
  const currentVideoState = useRef(true)
  const audioPeersRef = useRef([])


  useEffect(() => {
    const socket = io('http://localhost:5001');
    socketRef.current = socket
    setSocket(socket)

    return () => {
      socketRef.current?.disconnect()
    }
  }, [])



  useEffect(() => {
    if (!socket) return;
    socket.on('connect', async () => {
      socket.emit('getRTPCapabilites', async (response) => {
        await handleCapabilities(response?.capabilities)
        const obj = {
          room: window?.location?.pathname?.split('/')[2],
        }
        socket.emit('addUserCall', obj)
   

        if (window?.location?.search !== '?type=viewer') {
          await startStream()
          startProducing()
        }
        else{
          localStreamRef.current = await navigator?.mediaDevices?.getUserMedia({
            audio: {
              noiseSuppression: true,
              echoCancellation: true
            },
          })
        }
      })
    })

    return () => {
      socket.off('connect');
    }
  }, [socket])

  async function startStream() {
    try {
      localStreamRef.current = await navigator?.mediaDevices?.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true
        },
        video:true
      })
      localVideoCont.current.style.display = 'flex'
      localStreamElemRef.current.srcObject = localStreamRef.current;


    }
    catch (err) {
      console.log(err)
    }
  }

  async function startProducing() {
    socket.emit('createTransport', socket.id)
  }

  useEffect(() => {
    if (!socket) return;
    socket.on('transportCreated', (data) => {
      handleTransport(data)
    })

    return () => {
      socket.off('transportCreated')
    }
  }, [socket])

  async function handleTransport({ data }) {
    console.log('trans')
    produceTransport.current = await mediasoupDevice.current?.createSendTransport(data);

    produceTransport.current?.on('connect', ({ dtlsParameters }, callback, errback) => {
      socket.emit('connectTransport', { dtlsParameters, id: socket.id })
      socket.once('transportConnected', () => {
        callback()
      })
    })

    produceTransport.current?.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
      socket.emit('produce', { kind, rtpParameters, id: socket.id, room: window?.location?.pathname?.split('/')[2], appData })
      socket.once('producing', ({ producerId, kind, screenShare }) => {
        if (kind === 'video') {
          if (screenShare) {
            videoProducerId2.current = producerId
          }
          else {
            videoProducerId.current = producerId;
          }
        }
        else {
          if (screenShare) {
            audioProducerId2.current = producerId
          }
          else {
            audioProducerId.current = producerId
          }
        }
        callback(producerId)
      })
    })

    produceTransport.current?.on("connectionstatechange", (state) => {
      switch (state) {
        case 'connecting':
          console.log('connecting')
          break;
        case 'connected':
          console.log("connected")
          break;
        case 'failed':
          console.log("failed")
          socket.emit("producerRestartIce", async (params) => {
            await produceTransport.current?.restartIce({
              iceParameters: params,
            });
          });
          break;
        default:
          break;
      }
    })

    try {
      const Audiotracks = localStreamRef?.current?.getAudioTracks()[0]
      const Videotracks = localStreamRef?.current?.getVideoTracks()[0]
      if (Audiotracks) {
        audioProducer.current = await produceTransport.current?.produce({ track: Audiotracks })

      }
      if (Videotracks) {
        videoProducer.current = await produceTransport.current?.produce({
          track: Videotracks,
          encodings: [
            {
              rid: "r0",
              scaleResolutionDownBy: 4,
              maxBitrate: 500000,
              scalabilityMode: 'L1T3'
            }
            ,
            {
              rid: "r1",
              scaleResolutionDownBy: 2,
              maxBitrate: 1500000,
              scalabilityMode: 'L1T3'
            }
            , {
              rid: "r2",
              scaleResolutionDownBy: 1,
              maxBitrate: 3500000,
              scalabilityMode: 'L1T3'
            }]
        })
      }

    }
    catch (err) {
      console.log(err)
    }

  }

  async function handleCapabilities(capabilities) {
    const cap = { routerRtpCapabilities: capabilities };
    const detectedHandler = detectDevice()
    let handlerName;
    if (detectedHandler) {
      handlerName = detectedHandler
    }
    else {
      handlerName = 'Safari12'
    }

    try {
      if (handlerName !== 'Firefox60') {
        cap.routerRtpCapabilities.headerExtensions = cap.routerRtpCapabilities.headerExtensions.filter((ext) => ext.uri !== 'urn:3gpp:video-orientation');
      }
      mediasoupDevice.current = new Device({ handlerName: handlerName })

    }
    catch (err) {
      console.error(err)

    }
    await mediasoupDevice.current?.load(cap)

    if (mediasoupDevice?.current?.loaded) {
      console.log('loaded')
    }

  }


  useEffect(() => {
    if (!socket) return;
    socket.on('currentProducers', (producers) => {
      producers?.forEach((producer) => {
        startConsumeProducer(producer)
      })
    })

    return () => {
      socket.off('currentProducers')
    }

  }, [socket])

  function startConsumeProducer(producer) {
    socket.emit('createConsumeTransport', producer)
  }

  useEffect(() => {
    if (!socket) return;
    socket.on('ConsumeTransportCreated', async (data) => {
      await consume(data)
    })

    return () => {
      socket.off('ConsumeTransportCreated')
    }

  }, [socket])

  async function consume(data) {
    receiveTransport.current[data?.storageId] = await mediasoupDevice.current?.createRecvTransport(data.data)

    receiveTransport?.current[data?.storageId].on('connect', ({ dtlsParameters }, callback, errback) => {
      socket.emit('transportConnect', { dtlsParameters, storageId: data?.storageId })
      socket.on('consumerTransportConnected', (storageId) => {
        if (storageId === data?.storageId) {
          callback()
        }
      })
    })

    receiveTransport?.current[data?.storageId].on("connectionstatechange", (state) => {
      switch (state) {
        case 'connecting':
          console.log("Connecting To Stream!")
          break;
        case 'connected':
          console.log("subscribed!")
          break;
        case 'failed':
          console.log("Failed!")
          socket.emit(
            "consumerRestartIce",
            data?.storageId,
            async (params) => {
              await receiveTransport?.current[data?.storageId]?.restartIce({
                iceParameters: params,
              });
            },
          );
          break;
        default:
          break;
      }
    })

    socket.emit('startConsuming', { rtpCapabilities: mediasoupDevice?.current?.rtpCapabilities, storageId: data?.storageId, producerId: data?.producerId, socketId: data?.socketId, paused: false, screenShare: data?.screenShare })
  }

  useEffect(() => {
    if (!socket) return;
    socket.on('consumerCreated', (data) => {
      handleConsumer(data)
    })

    return () => {
      socket.off('consumerCreated')
    }
  }, [socket])

  async function handleConsumer(data) {
    const {
      producerId,
      kind,
      id,
      rtpParameters,
      screenShare,
      socketId,
      storageId,
      muted
    } = data;

    let codecOptions = {}


    const consumer = await receiveTransport?.current[data?.storageId].consume({ id, producerId, kind, rtpParameters, codecOptions })
    consumers.current.set(data?.storageId, consumer)
    const mediaStream = new MediaStream()
    mediaStream.addTrack(consumer.track)
    if (kind === 'video') {
      const idx = peersRef.current?.findIndex(
        (peer) => peer?.socketId === socketId && peer?.screenShare === false
      );
      if (idx !== -1 && screenShare === false) {
        peersRef.current[idx].mediaStream = mediaStream;
        peersRef.current[idx].storageId = storageId;
        setPeers([...peersRef.current]);
      } else {
        peersRef.current = [
          ...peersRef.current,
          {
            socketId: socketId,
            storageId: storageId,
            mediaStream,
            screenShare: screenShare,
          },
        ];
        setPeers((prev) => [
          ...prev,
          {
            socketId: socketId,
            storageId: storageId,
            mediaStream,
            screenShare: screenShare,
          },
        ]);
      }
    }
    else {
      const audioElem = document.createElement('audio')
      audioElem.autoplay = true;
      audioElem.srcObject = mediaStream;
      audioElem.id = data.storageId;
      document.body.appendChild(audioElem)
      audioPeersRef.current = [...audioPeersRef.current, { socketId: socketId, storageId: storageId, mediaStream: mediaStream, consumer: consumer }]
    }
    console.log('newConsumer', consumer?.track, screenShare)
  }

  useEffect(() => {
    if (!peers || peers?.length === 0) return;
    Object.keys(remoteStreamsRef.current).forEach((key) => {
      const source = peersRef.current.find((peer) => peer?.storageId === key?.split('_')[0])?.mediaStream;
      remoteStreamsRef.current[key].srcObject = source;

    })

  }, [peers])

  useEffect(() => {
    if (!socket) return;
    socket.on('newProducer', (producer) => {
      startConsumeProducer(producer)
    })

    return () => {
      socket.off('newProducer')
    }
  }, [socket])

  async function ScreenShare() {
    if (screenShareStarted.current) {
      const producerIds = audioProducerId2.current ? [videoProducerId2.current, audioProducerId2.current] : [videoProducerId2.current]
      socket.emit('closeScreenShare', producerIds, async (response) => {
        if (audioProducer2) {
          await audioProducer2.current?.close()
          audioProducer2.current = null
          audioProducerId2.current = null;
        }
        if (videoProducer2) {
          await videoProducer2.current?.close()
          videoProducer2.current = null;
          videoProducerId2.current = null
        }
        localScreenCont.current.style.display = 'none'
        localScreenStreamRef.current?.getTracks()?.forEach((track) => {
          track.stop()
        })
        localScreenStreamElemRef.current.srcObject = null
      })
      screenShareStarted.current = false;
    }
    else {
      localScreenStreamRef.current = await navigator?.mediaDevices?.getDisplayMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true
        },
        video: true,
      })
      if (!localScreenStreamRef.current) return;
      localScreenCont.current.style.display = 'flex'
      localScreenStreamElemRef.current.srcObject = localScreenStreamRef.current
      const Audiotracks = localScreenStreamRef?.current?.getAudioTracks()[0]
      const Videotracks = localScreenStreamRef?.current?.getVideoTracks()[0]
      if (Audiotracks) {
        audioProducer2.current = await produceTransport.current?.produce({
          track: Audiotracks, appData: {
            type: 'screen'
          }
        })

      }
      if (Videotracks) {
        videoProducer2.current = await produceTransport.current?.produce(
          {
            track: Videotracks,
            encodings: [
              {
                rid: "r0",
                scaleResolutionDownBy: 4,
                maxBitrate: 500000,
                scalabilityMode: 'L1T3'
              }
              ,
              {
                rid: "r1",
                scaleResolutionDownBy: 2,
                maxBitrate: 1500000,
                scalabilityMode: 'L1T3'
              }
              , {
                rid: "r2",
                scaleResolutionDownBy: 1,
                maxBitrate: 3500000,
                scalabilityMode: 'L1T3'
              }],
            appData: {
              type: 'screen'
            }
          }

        )
      }
      localScreenStreamRef.current.getVideoTracks()[0]?.addEventListener("ended", () => ScreenShare());
      screenShareStarted.current = true;
    }
  }


  useEffect(() => {
    if (!socket) return;
    socket.on('closeConsumer', async (storageId) => {
      console.log('close consumer', storageId)
      await receiveTransport.current[storageId]?.close()
      receiveTransport.current[storageId] = null;
      consumers.current.delete(storageId)
      const idx = peersRef.current?.findIndex((item) => item?.storageId === storageId)
      if (idx !== -1) {
        if (peersRef.current[idx]?.screenShare === false) {
          remoteStreamsRef.current[`${storageId}_video`].srcObject = null;
        }
        else {
          peersRef.current?.splice(idx, 1)
          setPeers([...peersRef.current])
        }

      }
      if (document.getElementById(storageId)) {
        document.body.removeChild(document.getElementById(storageId))
        const audioPeersFilter = audioPeersRef.current?.filter((item) => item?.storageId !== storageId)
        audioPeersRef.current = audioPeersFilter;
      }
    })
    return () => {
      socket.off('closeConsumer')
    }
  }, [socket])


  useEffect(() => {
    if (!socket) return;
    socket.on('userLeft', (socketId) => {
      const peeridx = peersRef.current.findIndex((peer) => peer?.socketId === socketId)
      if (peeridx !== -1) {
        const peersFilter = peersRef.current.filter((peer) => peer?.socketId !== socketId)
        peersRef.current = peersFilter;
        setPeers([...peersRef.current])
      }
    })


    return () => {
      socket.off('userLeft')
    }
  }, [socket])

  const handleMic = (state) => {
    const stateVar = state ? state : currentMicState.current;
    if (state && !state === currentMicState.current) {
      return;
    }
    socket.emit('handleProducer', {
      producerId: audioProducerId.current,
      state: stateVar
    }, async (response) => {
      if (currentMicState.current) {
        await audioProducer.current?.pause()
        currentMicState.current = false;
        micElem.current.innerHTML = 'Mic On'
      }
      else {
        await audioProducer.current?.resume()
        currentMicState.current = true;
        micElem.current.innerHTML = 'Mic Off'

      }
    })
  }

  const handleVideo = async (state) => {
    const stateVar = state ? state : currentVideoState.current;
    if (stateVar) {
      socket.emit(
        "closeProducer",
        videoProducerId.current,
        async (response) => {
          await videoProducer.current?.close();
          videoProducer.current = null;
          videoProducerId.current = null;
          localStreamRef.current?.srcObject
            ?.getVideoTracks()
            ?.forEach((track) => {
              track?.stop();
              localStreamRef.current?.srcObject?.removeTrack(track);
            });
        },
      );
      currentVideoState.current = false;
      videoElem.current.innerHTML = "Video On";
    } else {
      if (videoProducer.current) {
        return;
      }
      localStreamRef.current = await navigator?.mediaDevices?.getUserMedia({
        video: true,
      });
      localStreamElemRef.current.srcObject = localStreamRef.current;
      videoProducer.current = await produceTransport.current?.produce({
        track: localStreamRef.current.getVideoTracks()[0],
      });
      currentVideoState.current = true;
      videoElem.current.innerHTML = "Video Off";
    }
  }

  
  


  const handleLeave = () => {
    window.location.href = window.location.origin;
  }


  useEffect(() => {
    window.onbeforeunload = async () => {
      await socketRef.current?.disconnect()
      localStreamRef.current?.getTracks()?.forEach((track) => {
        track?.stop()
      })
      await produceTransport.current?.close()
      Object.keys(receiveTransport.current)?.forEach((key) => {
        receiveTransport.current[key]?.close()
      })
    }

  }, [])

  useEffect(() => {
    if (!socket) return;
    socket.on('speaking', (value) => {
      if (value) {

        if (globalTimeout.current) {
          clearTimeout(globalTimeout.current)
        }

        const myAudioIcon =
          document?.getElementById(`myStreamIcon`)?.childNodes;
        myAudioIcon?.forEach((item) => {
          if (!item.classList.contains("animate-audio-icon")) {
            item.classList.add("animate-audio-icon");
          }
        });

        globalTimeout.current = setTimeout(() => {
          const audioIconItems =
            document?.getElementById(`myStreamIcon`)?.childNodes;
          audioIconItems?.forEach((item) => {
            if (item.classList.contains("animate-audio-icon")) {
              item.classList.remove("animate-audio-icon");
            }
          });
        }, 700)
      }
    })

    return () => {
      socket.off('speaking')
    }

  }, [socket])

  useEffect(() => {
    if (!socket) return;

    const interv = setInterval(() => {
      handleVoiceSort();
    }, 700);

    return () => {
      clearInterval(interv);
    };

  }, [socket]);


  const handleVoiceSort = () => {
    if (!audioPeersRef.current) return;

    let tempArr = [];
    audioPeersRef.current.forEach((item) => {
      if (
        item.consumer?.rtpReceiver?.getSynchronizationSources()[0]
          ?.audioLevel >= 0.01
      ) {
        if (!tempArr.includes(item?.socketId)) {
          tempArr.push(item?.socketId);
        }
        document
          ?.getElementById(item?.socketId)
          ?.childNodes?.forEach((item) => {
            if (!item.classList.contains("animate-audio-icon")) {
              item.classList.add("animate-audio-icon");
            }
          });
      } else {
        document
          ?.getElementById(item?.socketId)
          ?.childNodes?.forEach((item) => {
            if (item.classList.contains("animate-audio-icon")) {
              item.classList.remove("animate-audio-icon");
            }
          });

      }
    });

  };

  useEffect(() => {
    if (!socket) return;
    socket.on("disconnect", async () => {
      const toaster = toast.loading("Waiting For Connection")
      await new Promise((resolve, reject) => {
        window.ononline = () => {
          toast.dismiss(toaster)
          toast.success("Back Online. Reloading...")
          window.location.reload();
          resolve();
        };
      });
    });

    return () => {
      socket.off('disconnect')
    }
  }, [socket]);



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center' }}>
      <Toaster position="top-center" />
      <div style={{ display: 'flex', flexWrap: 'wrap', padding: '5px 10px', gap: '1rem', justifyContent: 'flex-start' }}>
        <div ref={localVideoCont} style={{ display: 'none', flexDirection: 'column', alignItems: 'center', position: "relative" }}>
          <h1>Local Video</h1>
          <video muted autoPlay playsInline width={640} height={480} ref={localStreamElemRef} controls></video>
          <div style={{ position: "absolute", top: "16%", right: "3%" }} id="myStreamIcon" className="audio-icon-cont">
            <span className="audio-icon" />
            <span className="audio-icon" />
            <span className="audio-icon" />
          </div>
        </div>
        <div ref={localScreenCont} style={{ display: 'none', flexDirection: 'column', alignItems: 'center' }}>
          <h1>Local Screen</h1>
          <video muted autoPlay playsInline width={640} height={480} ref={localScreenStreamElemRef} controls></video>
        </div>
        {peers?.length > 0 && peers.map((peer, idx) =>
          <div key={peer?.storageId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: "relative" }}>
            <h1>Remote Stream {idx + 1}</h1>
            <video autoPlay playsInline width={640} height={480} ref={a => a ? remoteStreamsRef.current[`${peer?.storageId}_video`] = a : ''} controls></video>
            <div style={{ position: "absolute", top: "16%", right: "3%" }} id={peer?.socketId} className="audio-icon-cont">
              <span className="audio-icon" />
              <span className="audio-icon" />
              <span className="audio-icon" />
            </div>
          </div>
        )

        }
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', gap: '1.5rem' }}>
        <button onClick={ScreenShare} style={{ background: 'green', borderRadius: '7px', padding: '4px 7px', cursor: 'pointer', border: 'none', color: 'white', fontSize: '2rem', width: 'max-content' }} >Screen Share</button>
        <button ref={micElem} onClick={() => handleMic()} style={{ background: 'green', borderRadius: '7px', padding: '4px 7px', cursor: 'pointer', border: 'none', color: 'white', fontSize: '2rem', width: 'max-content' }} >Mic Off</button>
        <button ref={videoElem} onClick={() => handleVideo()} style={{ background: 'green', borderRadius: '7px', padding: '4px 7px', cursor: 'pointer', border: 'none', color: 'white', fontSize: '2rem', width: 'max-content' }} >Video Off</button>
        <button onClick={handleLeave} style={{ background: 'green', borderRadius: '7px', padding: '4px 7px', cursor: 'pointer', border: 'none', color: 'white', fontSize: '2rem', width: 'max-content' }} >Leave</button>

      </div>
    </div>
  )
      }

export default Room