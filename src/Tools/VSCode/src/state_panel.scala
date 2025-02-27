/*  Title:      Tools/VSCode/src/state_panel.scala
    Author:     Makarius

Show proof state.
*/

package isabelle.vscode


import isabelle._


object State_Panel
{
  private val make_id = Counter.make()
  private val instances = Synchronized(Map.empty[Counter.ID, State_Panel])

  def init(server: Language_Server): Unit =
  {
    val instance = new State_Panel(server)
    instances.change(_ + (instance.id -> instance))
    instance.init()
  }

  def exit(id: Counter.ID): Unit =
  {
    instances.change(map =>
      map.get(id) match {
        case None => map
        case Some(instance) => instance.exit(); map - id
      })
  }

  def locate(id: Counter.ID): Unit =
    instances.value.get(id).foreach(state =>
      state.server.editor.send_dispatcher(state.locate()))

  def update(id: Counter.ID): Unit =
    instances.value.get(id).foreach(state =>
      state.server.editor.send_dispatcher(state.update()))

  def auto_update(id: Counter.ID, enabled: Boolean): Unit =
    instances.value.get(id).foreach(state =>
      state.server.editor.send_dispatcher(state.auto_update(Some(enabled))))
}


class State_Panel private(val server: Language_Server)
{
  /* output */

  val id: Counter.ID = State_Panel.make_id()

  private def output(content: String): Unit =
    server.channel.write(LSP.State_Output(id, content, auto_update_enabled.value))


  /* query operation */

  private val output_active = Synchronized(true)

  private val print_state =
    new Query_Operation(server.editor, (), "print_state", _ => (),
      (snapshot, results, body) =>
        if (output_active.value) {
          if(body.nonEmpty){
            val elements3: Presentation.Elements =
              Presentation.Elements(
                html = Presentation.elements2.html,
                language = Presentation.elements2.language,
                entity = Markup.Elements.full)

            def entity_link(props: Properties.T, body: XML.Body): Option[XML.Tree] =
              (props, props) match {
                case (Position.Def_File(thy_file), Position.Def_Line(def_line)) =>
                  val fileMaybe = server.resources.source_file(thy_file)
                  fileMaybe match {
                      case Some(file) =>
                        //val file = resources.node_file(value)
                        Some(HTML.link(Path.explode(file).absolute_file.toURI.toString + "#" + def_line, body))
                      case _ => None
                  }
                case _ => None
              }

            val htmlBody = Presentation.make_html(
              elements3,
              entity_link,
              Pretty.separate(body))

            output(HTML.source(htmlBody).toString())
          }
        })

  def locate(): Unit = print_state.locate_query()

  def update(): Unit =
  {
    server.editor.current_node_snapshot(()) match {
      case Some(snapshot) =>
        (server.editor.current_command((), snapshot), print_state.get_location) match {
          case (Some(command1), Some(command2)) if command1.id == command2.id =>
          case _ => print_state.apply_query(Nil)
        }
      case None =>
    }
  }


  /* auto update */

  private val auto_update_enabled = Synchronized(true)

  def auto_update(set: Option[Boolean] = None): Unit =
  {
    val enabled =
      auto_update_enabled.guarded_access(a =>
        set match {
          case None => Some((a, a))
          case Some(b) => Some((b, b))
        })
    if (enabled) update()
  }



  /* main */

  private val main =
    Session.Consumer[Any](getClass.getName) {
      case changed: Session.Commands_Changed =>
        if (changed.assignment) auto_update()

      case Session.Caret_Focus =>
        auto_update()
    }

  def init(): Unit =
  {
    server.session.commands_changed += main
    server.session.caret_focus += main
    server.editor.send_wait_dispatcher { print_state.activate() }
    server.editor.send_dispatcher { auto_update() }
  }

  def exit(): Unit =
  {
    output_active.change(_ => false)
    server.session.commands_changed -= main
    server.session.caret_focus -= main
    server.editor.send_wait_dispatcher { print_state.deactivate() }
  }
}
