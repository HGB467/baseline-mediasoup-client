import React, { useState } from 'react'
import {v4} from 'uuid'
import { useNavigate } from 'react-router-dom'

const Home = () => {

    const navigate = useNavigate()

    const[id,setId] = useState('')


    const visitRoom = () => {
        navigate(`/room/${v4()}`)
    }

    const visitRoomByID = () => {
      if(!id) return;
      navigate(`/room/${id}`)

    }

    const visitRoomAsViewer = () => {
      if(!id) return;
      navigate(`/room/${id}?type=viewer`)
    }

  return (
    <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',minHeight:'100vh',gap:'2rem'}}>
        <button onClick={visitRoom} style={{background:'green',borderRadius:'7px',padding:'4px 7px',cursor:'pointer',border:'none',color:'white',fontSize:'2rem'}} >Create & Join Room</button>
        <h1>OR</h1>
        <div style={{display:"flex",flexDirection:'column',gap:'1rem'}}>
        <input style={{fontSize:'1.5rem',padding:'5px 6px'}} onChange={(e)=>setId(e.target.value)} type="text" placeholder='ID'></input>
        <button onClick={visitRoomByID} style={{background:'green',borderRadius:'7px',padding:'4px 7px',cursor:'pointer',border:'none',color:'white',fontSize:'2rem'}} >Join By ID</button>
        <button onClick={visitRoomAsViewer} style={{background:'green',borderRadius:'7px',padding:'4px 7px',cursor:'pointer',border:'none',color:'white',fontSize:'2rem'}} >Join As Viewer</button>
        </div>
    </div>
  )
}

export default Home