import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Project } from '../types/domain'
import { createProject, fetchProjectsByOwner } from '../features/projects/projectsService'
import { sendEdgeEmail } from '../services/edgeFunctions'

export function ProjectsPage() {
  const [ownerId, setOwnerId] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [notifyEmail, setNotifyEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function fillCurrentUserId() {
    setError('')
    if (!supabase) {
      setError('Supabase is nog niet geconfigureerd.')
      return
    }

    const { data, error: userError } = await supabase.auth.getUser()
    if (userError || !data.user) {
      setError('Geen ingelogde gebruiker gevonden.')
      return
    }
    setOwnerId(data.user.id)
  }

  async function handleLoadProjects() {
    if (!ownerId.trim()) {
      setError('Vul eerst een owner id in.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    try {
      const data = await fetchProjectsByOwner(ownerId.trim())
      setProjects(data)
      setMessage(`${data.length} project(en) geladen.`)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Projecten laden mislukt.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateProject(event: FormEvent) {
    event.preventDefault()
    if (!ownerId.trim()) {
      setError('Owner id is verplicht.')
      return
    }
    if (!title.trim()) {
      setError('Titel is verplicht.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    try {
      const created = await createProject({
        ownerId: ownerId.trim(),
        title: title.trim(),
        description: description.trim() || undefined,
        targetAmount: targetAmount ? Number(targetAmount) : undefined,
      })

      setProjects((prev) => [created, ...prev])
      setMessage('Project aangemaakt.')

      if (notifyEmail.trim()) {
        await sendEdgeEmail({
          to: notifyEmail.trim(),
          type: 'project_created',
          payload: {
            projectId: created.id,
            title: created.title,
          },
          notifyAdmin: false,
        })
      }

      setTitle('')
      setDescription('')
      setTargetAmount('')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Project aanmaken mislukt.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <header>
        <h1>Projects beheer (React slice)</h1>
        <p>Basisflow voor owner-projecten laden en nieuwe projecten aanmaken.</p>
      </header>

      <section className="card">
        <h2>Owner context</h2>
        <div className="toolbar-row">
          <input
            className="input"
            type="text"
            placeholder="Owner user id"
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
          />
          <button type="button" className="button secondary" onClick={() => void fillCurrentUserId()}>
            Gebruik ingelogde user
          </button>
          <button type="button" className="button secondary" onClick={() => void handleLoadProjects()} disabled={loading}>
            {loading ? 'Laden...' : 'Projecten laden'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Nieuw project</h2>
        <form onSubmit={handleCreateProject} className="form-stack">
          <input
            className="input"
            type="text"
            placeholder="Projecttitel"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <textarea
            className="input"
            placeholder="Beschrijving"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <input
            className="input"
            type="number"
            min="0"
            step="1"
            placeholder="Doelbedrag"
            value={targetAmount}
            onChange={(event) => setTargetAmount(event.target.value)}
          />
          <input
            className="input"
            type="email"
            placeholder="Optioneel: stuur edge mail naar"
            value={notifyEmail}
            onChange={(event) => setNotifyEmail(event.target.value)}
          />
          <button className="button" type="submit" disabled={loading}>
            {loading ? 'Bezig...' : 'Project aanmaken'}
          </button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
        {message ? <p className="success-text">{message}</p> : null}
      </section>

      <section className="card">
        <h2>Projectlijst ({projects.length})</h2>
        {projects.length === 0 ? <p className="hint">Nog geen projecten geladen.</p> : null}
        {projects.length > 0 ? (
          <div className="table-wrap">
            <table className="overview-table">
              <thead>
                <tr>
                  <th>Titel</th>
                  <th>Status</th>
                  <th>Doel</th>
                  <th>Aangemaakt</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>{project.title}</td>
                    <td>{project.status}</td>
                    <td>{project.target_amount ?? '-'}</td>
                    <td>{new Date(project.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="card">
        <Link to="/">Terug naar home</Link>
      </section>
    </main>
  )
}
